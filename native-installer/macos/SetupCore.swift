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
            posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETPGROUP))
            posix_spawnattr_setpgroup(&attributes, 0)
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

final class SetupController {
    let kit: SetupKit
    let runner: SetupCommandRunning
    private(set) var selectedFolder: URL?
    private(set) var busy = false
    private(set) var hasChecked = false
    private(set) var summary = "Choose Check laptop to inspect installed tools.\nNothing is installed by opening this app or running a check.\n\nSet up Zero places the complete kit in a new folder. Continue setup then opens the guided terminal menu, where each repair or installation is your choice. GitHub is separate; Git is optional for local Run."
    var changed: (() -> Void)?

    init(kit: SetupKit, runner: SetupCommandRunning = NativeCommandRunner()) {
        self.kit = kit
        self.runner = runner
    }

    func check() {
        guard !busy else { return }
        do {
            let command = try SetupKit(root: selectedFolder ?? kit.root).checkCommand()
            busy = true
            summary = "Checking this laptop… No installation is requested.\nThis check can take up to three minutes."
            changed?()
            runner.run(command, timeout: 180) { [weak self] result in
                guard let self else { return }
                self.busy = false
                self.hasChecked = true
                let heading: String
                if result.timedOut { heading = "Check timed out. Readiness is unverified; use Check again." }
                else if let error = result.launchError { heading = "Check could not finish: \(error). Readiness is unverified." }
                else if result.succeeded { heading = "The kit check reports ready for local Run. Open Zero and run the first app to confirm its window." }
                else { heading = "Check needs attention (\(result.exitCode.map { "exit \($0)" } ?? "process stopped")). Review the details below, then use Set up Zero for guided help." }
                self.summary = heading + "\n\n" + result.output
                self.changed?()
            }
        } catch { summary = error.localizedDescription; changed?() }
    }

    /// Both window-close and application-quit share this policy. Keep the owner
    /// alive until an asynchronous check/copy/open completes; no cancellation.
    func mayExit() -> Bool {
        guard busy else { return true }
        let message = "Please wait for the current check, copy or open request to finish before closing Zero Setup."
        if !summary.hasPrefix(message) { summary = message + "\n\n" + summary; changed?() }
        return false
    }

    func place(parent: URL?, name: String?) {
        guard !busy, let parent, let name else { return }
        busy = true
        summary = "Copying the complete kit into a new folder…"
        changed?()
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let result = Result { try kit.place(parent: parent, name: name) }
            DispatchQueue.main.async {
                self.busy = false
                switch result {
                case .success(let folder):
                    self.selectedFolder = folder
                    self.summary = "The complete kit is in:\n\(folder.path)\n\nChoose Continue setup to open its guided terminal menu. Each repair, profile or extension action still asks you to choose. Choose Open folder to see your files. GitHub remains separate."
                case .failure(let error): self.summary = error.localizedDescription
                }
                self.changed?()
            }
        }
    }

    func continueSetup() {
        guard !busy, let selectedFolder else { return }
        do { try SetupKit(root: selectedFolder).validate() }
        catch { summary = error.localizedDescription; changed?(); return }
        let command = SetupCommand(executable: "/usr/bin/open", arguments: ["-a", "Terminal", selectedFolder.appendingPathComponent("setup/Setup.command").path])
        busy = true; changed?()
        runner.run(command, timeout: 15) { [weak self] result in
            guard let self else { return }
            self.busy = false
            if result.succeeded { self.summary = "Requested guided setup in Terminal for:\n\(selectedFolder.path)\n\nUse its normal prompts to choose actions. A successful open request does not confirm that setup or an installation finished. Return here to check again." }
            else { self.summary = "Could not open guided setup in Terminal. Open \(selectedFolder.appendingPathComponent("setup/Setup.command").path) manually.\n\n\(result.launchError ?? result.output)" }
            self.changed?()
        }
    }
}
