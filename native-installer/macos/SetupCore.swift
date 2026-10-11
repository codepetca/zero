import Foundation
import Darwin

struct SetupFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct SetupCommand: Equatable {
    let executable: String
    let arguments: [String]
}

struct CommandResult {
    let exitCode: Int32?
    let output: String
    let timedOut: Bool
    let launchError: String?

    var succeeded: Bool { exitCode == 0 && !timedOut && launchError == nil }
}

protocol SetupCommandRunning {
    func run(_ command: SetupCommand, timeout: TimeInterval, completion: @escaping (CommandResult) -> Void)
}

/// Each probe owns a process group, so timeout also stops its shell/tool children.
/// All commands have separate arguments. No shell command text is constructed.
final class NativeCommandRunner: SetupCommandRunning {
    func run(_ command: SetupCommand, timeout: TimeInterval, completion: @escaping (CommandResult) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            var descriptors: [Int32] = [0, 0]
            guard pipe(&descriptors) == 0 else {
                DispatchQueue.main.async { completion(CommandResult(exitCode: nil, output: "", timedOut: false, launchError: "Could not capture the check output.")) }
                return
            }
            guard fcntl(descriptors[0], F_SETFL, O_NONBLOCK) == 0,
                  fcntl(descriptors[0], F_SETFD, FD_CLOEXEC) == 0,
                  fcntl(descriptors[1], F_SETFD, FD_CLOEXEC) == 0 else {
                close(descriptors[0]); close(descriptors[1])
                DispatchQueue.main.async { completion(CommandResult(exitCode: nil, output: "", timedOut: false, launchError: "Could not prepare bounded output capture.")) }
                return
            }
            var actions: posix_spawn_file_actions_t?
            var attributes: posix_spawnattr_t?
            posix_spawn_file_actions_init(&actions)
            posix_spawnattr_init(&attributes)
            defer {
                posix_spawn_file_actions_destroy(&actions)
                posix_spawnattr_destroy(&attributes)
            }
            posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0)
            posix_spawn_file_actions_adddup2(&actions, descriptors[1], STDOUT_FILENO)
            posix_spawn_file_actions_adddup2(&actions, descriptors[1], STDERR_FILENO)
            posix_spawn_file_actions_addclose(&actions, descriptors[0])
            posix_spawn_file_actions_addclose(&actions, descriptors[1])
            // Dispatch workers block signals. Inheriting their mask prevents
            // Bash probe timers from receiving TERM during normal cleanup.
            // Reset only the child, including dispositions ignored by the host.
            var childSignalMask = sigset_t()
            var childSignalDefaults = sigset_t()
            sigemptyset(&childSignalMask)
            sigemptyset(&childSignalDefaults)
            for signal in 1..<NSIG where signal != SIGKILL && signal != SIGSTOP {
                sigaddset(&childSignalDefaults, signal)
            }
            guard posix_spawnattr_setsigmask(&attributes, &childSignalMask) == 0,
                  posix_spawnattr_setsigdefault(&attributes, &childSignalDefaults) == 0,
                  posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETPGROUP | POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_SETSIGDEF)) == 0,
                  posix_spawnattr_setpgroup(&attributes, 0) == 0 else {
                close(descriptors[0]); close(descriptors[1])
                DispatchQueue.main.async { completion(CommandResult(exitCode: nil, output: "", timedOut: false, launchError: "Could not prepare the check process signal state.")) }
                return
            }
            let arguments = ([command.executable] + command.arguments).map { strdup($0) } + [nil]
            let environment = ProcessInfo.processInfo.environment.map { strdup("\($0.key)=\($0.value)") } + [nil]
            defer {
                arguments.forEach { free($0) }
                environment.forEach { free($0) }
            }
            var pid: pid_t = 0
            let launched = arguments.withUnsafeBufferPointer { argv in
                environment.withUnsafeBufferPointer { env in
                    posix_spawn(&pid, command.executable, &actions, &attributes,
                                UnsafeMutablePointer(mutating: argv.baseAddress!), UnsafeMutablePointer(mutating: env.baseAddress!))
                }
            }
            close(descriptors[1])
            guard launched == 0 else {
                close(descriptors[0])
                let explanation = String(cString: strerror(launched))
                DispatchQueue.main.async { completion(CommandResult(exitCode: nil, output: "", timedOut: false, launchError: explanation)) }
                return
            }

            let state = ProbeState(pid: pid)
            let output = ProbeOutput()
            let reader = DispatchGroup()
            reader.enter()
            let readDescriptor = descriptors[0]
            DispatchQueue.global(qos: .utility).async {
                var buffer = [UInt8](repeating: 0, count: 8192)
                var reachedEOF = false
                while output.canRead {
                    let count = read(readDescriptor, &buffer, buffer.count)
                    if count > 0 { output.append(buffer, count: count) }
                    else if count < 0 && errno == EINTR { continue }
                    else if count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK) { usleep(10_000) }
                    else { reachedEOF = count == 0; break }
                }
                close(readDescriptor)
                output.finish(reachedEOF: reachedEOF)
                reader.leave()
            }
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + timeout) {
                if state.expire() {
                    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 2) { state.forceStop() }
                }
            }
            var status: Int32 = 0
            var waited: pid_t
            repeat { waited = waitpid(pid, &status, 0) } while waited == -1 && errno == EINTR
            let timedOut = state.finish()
            // A failed tool may leave descendants holding the output pipe open.
            // This group belongs exclusively to this command, never to the app.
            kill(-pid, SIGKILL)
            // A detached descendant can retain stdout after leaving our group.
            // Its pipe must not defeat the command timeout or the exit result.
            output.beginDrain()
            let drained = reader.wait(timeout: .now() + 1.25) == .success
            output.stop()
            let capture = output.snapshot()
            let exited = waited == pid && (status & 0x7f) == 0
            let result = CommandResult(exitCode: exited ? (status >> 8) & 0xff : nil,
                                       output: capture.text, timedOut: timedOut,
                                       launchError: waited == -1 ? "Could not read the check result." :
                                        (!drained || !capture.complete ? "Output capture was incomplete. Readiness is unverified; use Check again." : nil))
            DispatchQueue.main.async { completion(result) }
        }
    }
}

private final class ProbeState {
    let lock = NSLock()
    let pid: pid_t
    var finished = false
    var timedOut = false
    init(pid: pid_t) { self.pid = pid }
    func expire() -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard !finished else { return false }
        timedOut = true
        kill(-pid, SIGTERM)
        return true
    }
    func forceStop() {
        lock.lock(); defer { lock.unlock() }
        if !finished { kill(-pid, SIGKILL) }
    }
    func finish() -> Bool {
        lock.lock(); defer { lock.unlock() }
        finished = true
        return timedOut
    }
}

private final class ProbeOutput {
    private let lock = NSLock()
    private var bytes = Data()
    private var truncated = false
    private var reachedEOF = false
    private var stopped = false
    private var drainDeadline = TimeInterval.infinity
    var canRead: Bool {
        lock.lock(); defer { lock.unlock() }
        return !stopped && ProcessInfo.processInfo.systemUptime < drainDeadline
    }
    func beginDrain() {
        lock.lock(); defer { lock.unlock() }
        drainDeadline = ProcessInfo.processInfo.systemUptime + 1
    }
    func stop() {
        lock.lock(); defer { lock.unlock() }
        stopped = true
    }
    func finish(reachedEOF: Bool) {
        lock.lock(); defer { lock.unlock() }
        self.reachedEOF = reachedEOF
    }
    func append(_ buffer: [UInt8], count: Int) {
        lock.lock(); defer { lock.unlock() }
        let remaining = max(0, 512 * 1024 - bytes.count)
        bytes.append(contentsOf: buffer.prefix(min(count, remaining)))
        if count > remaining { truncated = true }
    }
    func snapshot() -> (text: String, complete: Bool) {
        lock.lock(); defer { lock.unlock() }
        return (String(decoding: bytes, as: UTF8.self) + (truncated ? "\n[Output truncated after 512 KiB.]" : ""), reachedEOF && !truncated)
    }
}

struct SetupKit {
    let root: URL
    private let manager = FileManager.default

    func validate() throws {
        var directory: ObjCBool = false
        guard manager.fileExists(atPath: root.path, isDirectory: &directory), directory.boolValue else {
            throw SetupFailure(message: "The bundled kit is missing. Get a complete Zero Setup package from your teacher.")
        }
        try rejectSymlink(root)
        let required = ["START-HERE.md", "setup/setup.sh", "setup/Setup.command", "setup/kit.properties",
                        "starter/zero.json", "starter/pom.xml", "starter/mvnw", "starter/mvnw.cmd",
                        "starter/.mvn/wrapper/maven-wrapper.properties", "starter/.vscode/tasks.json", "optional/Zero.code-profile"]
        for name in required {
            let file = root.appendingPathComponent(name)
            guard manager.fileExists(atPath: file.path, isDirectory: &directory), !directory.boolValue else {
                throw SetupFailure(message: "The bundled kit is incomplete: \(name). Get a complete Zero Setup package.")
            }
        }
        let metadata = try String(contentsOf: root.appendingPathComponent("setup/kit.properties"), encoding: .utf8)
        let versions = metadata.components(separatedBy: .newlines).filter { $0.hasPrefix("kitVersion=") }
        guard versions.count == 1 else { throw SetupFailure(message: "The bundled kit version is invalid.") }
        let version = String(versions[0].dropFirst("kitVersion=".count))
        guard version.range(of: #"^[0-9]+\.[0-9]+\.[0-9]+$"#, options: .regularExpression) != nil,
              manager.fileExists(atPath: root.appendingPathComponent("zero-\(version).vsix").path) else {
            throw SetupFailure(message: "The bundled Zero extension is missing or its version is invalid.")
        }
        guard let enumerator = manager.enumerator(at: root, includingPropertiesForKeys: [.isSymbolicLinkKey], options: []) else {
            throw SetupFailure(message: "The bundled kit cannot be read.")
        }
        for case let url as URL in enumerator { try rejectSymlink(url) }
        guard manager.isExecutableFile(atPath: root.appendingPathComponent("setup/Setup.command").path),
              manager.isExecutableFile(atPath: root.appendingPathComponent("starter/mvnw").path) else {
            throw SetupFailure(message: "The bundled kit lost its executable permissions. Get a complete Zero Setup package.")
        }
    }

    func checkCommand() throws -> SetupCommand {
        try validate()
        return SetupCommand(executable: "/bin/bash", arguments: [root.appendingPathComponent("setup/setup.sh").path, "--check"])
    }

    /// Publish a complete copy atomically. RENAME_EXCL refuses files, directories
    /// and dangling symlinks, including a destination created during copying.
    func place(parent: URL, name: String, beforePublish: (() throws -> Void)? = nil) throws -> URL {
        try validate()
        guard !name.isEmpty, name != ".", name != "..", name.utf8.count <= 200,
              !name.contains("/"), !name.contains(":"), !name.contains("\0"),
              !name.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains),
              name == name.trimmingCharacters(in: .whitespacesAndNewlines) else {
            throw SetupFailure(message: "Use a short folder name without slashes, colons or surrounding spaces.")
        }
        try rejectSymlink(parent)
        let canonicalParent = parent.standardizedFileURL.resolvingSymlinksInPath()
        var directory: ObjCBool = false
        guard manager.fileExists(atPath: canonicalParent.path, isDirectory: &directory), directory.boolValue,
              manager.isWritableFile(atPath: canonicalParent.path) else {
            throw SetupFailure(message: "Choose an existing writable folder for your new Zero project.")
        }
        let destination = canonicalParent.appendingPathComponent(name, isDirectory: true)
        var info = stat()
        guard lstat(destination.path, &info) != 0 && errno == ENOENT else {
            throw SetupFailure(message: "That folder already exists. Choose a new name; Zero never replaces an existing project.")
        }
        var template = Array(canonicalParent.appendingPathComponent(".zero-setup-XXXXXX").path.utf8CString)
        guard let temporaryPath = mkdtemp(&template) else {
            throw SetupFailure(message: "Could not create a temporary folder. Choose another writable folder.")
        }
        let temporary = URL(fileURLWithPath: String(cString: temporaryPath), isDirectory: true)
        defer { try? manager.removeItem(at: temporary) }
        let staging = temporary.appendingPathComponent("kit", isDirectory: true)
        // The private, exclusively created container owns all partial copies.
        try manager.copyItem(at: root, to: staging)
        try beforePublish?()
        guard renamex_np(staging.path, destination.path, UInt32(RENAME_EXCL)) == 0 else {
            if errno == EEXIST || errno == ENOTEMPTY {
                throw SetupFailure(message: "That folder appeared during setup. It was preserved. Choose a new name.")
            }
            throw SetupFailure(message: "Could not place the kit: \(String(cString: strerror(errno))). Choose another writable folder.")
        }
        return destination
    }

    private func rejectSymlink(_ url: URL) throws {
        var info = stat()
        guard lstat(url.path, &info) == 0 else { throw SetupFailure(message: "Cannot read \(url.lastPathComponent).") }
        guard (info.st_mode & S_IFMT) != S_IFLNK else {
            throw SetupFailure(message: "Choose a real folder. Symbolic links are not supported by Zero Setup.")
        }
    }
}

/// Only the final complete protocol block is authoritative. Human/tool output
/// stays in diagnostics; a successful process exit alone never proves readiness.
struct SetupSnapshot {
    let fields: [String: Bool]
    subscript(_ key: String) -> Bool { fields[key] ?? false }
    var ready: Bool { self["ready"] }
    static func parse(_ output: String) throws -> SetupSnapshot {
        let fields = try protocolFields(output, start: "ZERO_SETUP_V1", end: "END_ZERO_SETUP")
        let keys: Set<String> = ["kit", "code", "java", "profile", "zero", "redhat", "javaHomeBlocked", "ready"]
        guard Set(fields.keys) == keys, fields.values.allSatisfy({ $0 == "0" || $0 == "1" }) else {
            throw SetupFailure(message: "Invalid setup check response.")
        }
        let snapshot = SetupSnapshot(fields: fields.mapValues { $0 == "1" })
        let complete = ["kit", "code", "java", "profile", "zero", "redhat"].allSatisfy { snapshot[$0] }
        guard snapshot.ready == complete, !(snapshot["javaHomeBlocked"] && snapshot["java"]) else {
            throw SetupFailure(message: "Inconsistent setup check response.")
        }
        return snapshot
    }
}

private func protocolFields(_ output: String, start: String, end: String) throws -> [String: String] {
    let lines = output.components(separatedBy: .newlines)
    guard let begin = lines.lastIndex(of: start), let finish = lines.lastIndex(of: end), finish > begin,
          lines[(finish + 1)...].allSatisfy({ $0.isEmpty }) else {
        throw SetupFailure(message: "Incomplete setup response.")
    }
    var result: [String: String] = [:]
    for line in lines[(begin + 1)..<finish] {
        let pair = line.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
        guard pair.count == 2, result[String(pair[0])] == nil else { throw SetupFailure(message: "Invalid setup response.") }
        result[String(pair[0])] = String(pair[1])
    }
    return result
}

enum ProfileImportStep: Int, CaseIterable {
    case commandPalette, importMenu, filePicker, pastePath, create
}

enum SetupStage: Equatable {
    case checking, chooseFolder, manualTool(String), blockedJava
    case profileConsent, profileStep(ProfileImportStep), extensionConsent, ready, retry, opened
}

final class SetupController {
    let kit: SetupKit
    let runner: SetupCommandRunning
    private(set) var selectedFolder: URL?
    private(set) var busy = false
    private(set) var hasChecked = false
    private(set) var stage: SetupStage = .checking
    private(set) var summary = "Checking your laptop…"
    private(set) var diagnostics = "Git is optional for local apps. GitHub sign-in and sharing are separate.\nAfter changing Java, fully quit VS Code (⌘Q) and reopen it. A CLI check does not verify the Java environment in an already-running editor.\n"
    private var snapshot: SetupSnapshot?
    private var profileImportStarted = false
    var changed: (() -> Void)?

    init(kit: SetupKit, runner: SetupCommandRunning = NativeCommandRunner()) { self.kit = kit; self.runner = runner }

    var primaryTitle: String {
        switch stage {
        case .checking: return "Please wait"
        case .chooseFolder: return "Choose folder…"
        case .manualTool: return "Open download page"
        case .blockedJava, .retry: return "Check again"
        case .profileConsent: return "Open VS Code"
        case .profileStep(let step):
            switch step {
            case .filePicker: return "Copy profile path"
            case .create: return "Check profile"
            default: return "Next"
            }
        case .extensionConsent: return "Install support"
        case .ready: return "Open Zero"
        case .opened: return "Open Zero again"
        }
    }
    var profileFile: URL { (selectedFolder ?? kit.root).appendingPathComponent("optional/Zero.code-profile") }
    var consent: (title: String, detail: String)? {
        switch stage {
        case .profileConsent:
            return ("Import the Zero profile", "VS Code needs one manual import. Open the Command Palette and choose Preferences: Open Profiles (UI). Use the menu beside New Profile > Import Profile… > Select File…. Choose the supplied Zero.code-profile file, name it Zero, and choose Create.\n\nThis adds the supplied light theme and autosave settings in a separate profile. Your existing profiles are preserved. Follow the steps here, then choose Check profile.")
        case .extensionConsent:
            return ("Install Zero support?", "Install the bundled Zero extension and any missing Java language support (redhat.java) in the Zero profile? Java support downloads from the VS Code Marketplace. Compatible installed extensions are kept. Your other profiles and settings are preserved.")
        default: return nil
        }
    }

    private func set(_ next: SetupStage, _ message: String) { stage = next; summary = message; changed?() }
    private func record(_ text: String) {
        diagnostics += text + "\n"
        if diagnostics.utf8.count > 1024 * 1024 { diagnostics = String(diagnostics.suffix(512 * 1024)) }
    }
    private func fail(_ message: String, detail: String) {
        snapshot = nil; busy = false; record(detail); set(.retry, message)
    }
    private func run(_ arguments: [String], status: String, timeout: TimeInterval = 180, completion: @escaping (CommandResult) -> Void) {
        do {
            let current = SetupKit(root: selectedFolder ?? kit.root)
            try current.validate()
            busy = true; summary = status; changed?()
            let command = SetupCommand(executable: "/bin/bash", arguments: [current.root.appendingPathComponent("setup/setup.sh").path] + arguments)
            runner.run(command, timeout: timeout) { [weak self] result in
                guard let self else { return }
                self.busy = false
                self.record("Action: \(arguments.joined(separator: " "))\nExit: \(result.exitCode.map(String.init) ?? "stopped")\n\(result.output)")
                if result.timedOut { self.fail("Setup timed out. Try again.", detail: "Command exceeded \(timeout) seconds. Readiness is unverified."); return }
                if let error = result.launchError { self.fail("Setup could not finish. Try again.", detail: error); return }
                if !result.succeeded { self.fail("Setup needs attention. Try again.", detail: "Action failed. No readiness confirmed. Use Details for details."); return }
                completion(result)
            }
        } catch { fail("The kit needs attention. See Details.", detail: error.localizedDescription) }
    }
    func check() {
        guard !busy else { return }
        snapshot = nil; stage = .checking
        run(["--native-check"], status: "Checking your laptop…") { [weak self] result in
            guard let self else { return }
            self.hasChecked = true
            do {
                self.snapshot = try SetupSnapshot.parse(result.output)
                guard self.snapshot?["kit"] == true else { self.fail("The kit is incomplete. See Details.", detail: "Kit metadata or required files are incomplete."); return }
                if self.selectedFolder == nil { self.set(.chooseFolder, "Choose a folder for your Zero kit."); return }
                self.advance()
            } catch { self.fail("The check was incomplete. Try again.", detail: error.localizedDescription) }
        }
    }
    private func advance() {
        guard let snapshot else { return }
        guard snapshot["kit"] else { fail("The kit is incomplete. See Details.", detail: "Extract a complete Zero kit."); return }
        if !snapshot["code"] { plan("code"); return }
        if !snapshot["java"] {
            if snapshot["javaHomeBlocked"] {
                record("JAVA_HOME selects an incompatible or missing JDK. Ask your teacher/IT to select an installed matching JDK 17+. Setup will not change this environment choice.")
                set(.blockedJava, "Java needs help. See Details.")
            } else { plan("java") }
            return
        }
        if !snapshot["profile"] {
            if profileImportStarted { set(.profileStep(.create), "Zero profile not found. Finish Create, then check.") }
            else { set(.profileConsent, "Import the Zero profile in VS Code.") }
            return
        }
        if !snapshot["zero"] || !snapshot["redhat"] { set(.extensionConsent, "Install Zero and Java editor support?"); return }
        guard snapshot.ready && selectedFolder != nil else { fail("Readiness is unverified. Try again.", detail: "Required check fields did not establish readiness."); return }
        set(.ready, "Zero is ready. Open it to begin.")
    }
    private func plan(_ tool: String) {
        run(["--native-plan", tool], status: tool == "code" ? "Finding VS Code setup options…" : "Finding Java setup options…") { [weak self] result in
            guard let self else { return }
            do {
                let fields = try protocolFields(result.output, start: "ZERO_PLAN_V1", end: "END_ZERO_PLAN")
                guard fields.count == 1, let action = fields["action"] else { throw SetupFailure(message: "Invalid installation proposal.") }
                switch action {
                case "manual": self.set(.manualTool(tool), tool == "code" ? "Install VS Code, then check again." : "Install Java 17 or newer, then check again.")
                case "blocked": self.fail("Setup needs help. See Details.", detail: "Tool setup is blocked by kit or environment configuration.")
                case "skip": self.set(.retry, "Tools changed. Check again.")
                default: throw SetupFailure(message: "Invalid installation proposal.")
                }
            } catch { self.fail("Setup options could not be checked.", detail: error.localizedDescription) }
        }
    }
    /// Consent is supplied only by a deliberate native confirmation button.
    func approve(_ approved: Bool) {
        guard !busy, approved else { return }
        switch stage {
        case .profileConsent:
            run(["--native-profile"], status: "Opening VS Code for profile import…", timeout: 30) { [weak self] _ in
                self?.profileImportStarted = true
                self?.showProfileStep(.commandPalette)
            }
        case .extensionConsent:
            installExtensions()
        default: break
        }
    }
    private func installExtensions() {
        guard let snapshot else { check(); return }
        let missing = ["zero", "redhat"].filter { !snapshot[$0] }
        func install(_ index: Int) {
            guard index < missing.count else { self.check(); return }
            let target = missing[index] == "zero" ? "zero" : "java"
            self.run(["--native-extension", target, "--approved"], status: target == "zero" ? "Installing Zero support…" : "Installing Java support…", timeout: 600) { _ in install(index + 1) }
        }
        install(0)
    }
    func primaryAction() {
        guard !busy else { return }
        switch stage {
        case .retry, .blockedJava: check()
        case .profileStep(let step):
            switch step {
            case .commandPalette: showProfileStep(.importMenu)
            case .importMenu: showProfileStep(.filePicker)
            case .pastePath: showProfileStep(.create)
            case .create: check()
            case .filePicker: break // Copy requires the explicit native clipboard action.
            }
        case .manualTool(let tool):
            let url = tool == "code" ? "https://code.visualstudio.com/download" : "https://adoptium.net/temurin/releases/?version=17"
            busy = true; summary = tool == "code" ? "Opening the VS Code download page…" : "Opening the Java download page…"; changed?()
            runner.run(SetupCommand(executable: "/usr/bin/open", arguments: [url]), timeout: 15) { [weak self] result in
                guard let self else { return }
                self.busy = false; self.record(result.output)
                if result.succeeded {
                    if tool == "java" {
                        self.record("After changing Java, fully quit VS Code (⌘Q) and reopen it so the editor receives the new environment. A CLI check does not verify an already-running editor's Java environment.")
                        self.set(.retry, "Install Java; quit VS Code (⌘Q), then check again.")
                    } else { self.set(.retry, "Finish installing VS Code, then check again.") }
                }
                else { self.fail("Could not open the download page.", detail: result.launchError ?? url) }
            }
        case .ready, .opened:
            // The backend rechecks immediately before launch, catching drift.
            run(["--native-open"], status: "Opening Zero…", timeout: 180) { [weak self] _ in self?.set(.opened, "In Zero, choose Run App to begin.") }
        default: break
        }
    }
    private func showProfileStep(_ step: ProfileImportStep) {
        let message: String
        switch step {
        case .commandPalette: message = "Press ⌘⇧P; open Preferences: Open Profiles (UI)."
        case .importMenu: message = "New Profile menu → Import Profile → Select File."
        case .filePicker: message = "Press ⌘⇧G in the file picker."
        case .pastePath: message = "Paste the path; press Return, then Open."
        case .create: message = "Click Create; keep the profile name Zero."
        }
        set(.profileStep(step), message)
    }
    var canGoBack: Bool {
        if case .profileStep(let step) = stage { return step != .commandPalette && !busy }
        return false
    }
    func previousProfileStep() {
        guard !busy, case .profileStep(let step) = stage,
              let previous = ProfileImportStep(rawValue: step.rawValue - 1) else { return }
        showProfileStep(previous)
    }
    /// Called only by the deliberate Copy profile path button. The UI owns the
    /// public clipboard API; an unsuccessful copy leaves the step unchanged.
    func copyProfilePath(_ copy: (String) -> Bool) {
        guard !busy, stage == .profileStep(.filePicker) else { return }
        do {
            try SetupKit(root: selectedFolder ?? kit.root).validate()
            guard copy(profileFile.path) else { record("Could not copy the profile path. Try Copy profile path again."); set(.profileStep(.filePicker), "Could not copy the path. Try again."); return }
            showProfileStep(.pastePath)
        } catch { fail("The profile file needs attention. See Details.", detail: error.localizedDescription) }
    }
    func mayExit() -> Bool {
        guard busy else { return true }
        summary = "Please wait for setup to finish this step."; changed?(); return false
    }
    func place(parent: URL?, name: String?) {
        guard !busy, selectedFolder == nil, let parent, let name else { return }
        busy = true; summary = "Preparing your Zero folder…"; changed?()
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let result = Result { try kit.place(parent: parent, name: name) }
            DispatchQueue.main.async {
                self.busy = false
                switch result {
                case .success(let folder): self.selectedFolder = folder; self.record("Kit folder: \(folder.path)"); self.check()
                case .failure(let error): self.record(error.localizedDescription); self.set(.chooseFolder, "Choose a fresh folder. See Details.")
                }
            }
        }
    }
}
