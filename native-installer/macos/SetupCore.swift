import Foundation
import Darwin

struct SetupFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct SetupCommand: Equatable {
    let executable: String
    let arguments: [String]
    var environment: [String: String]? = nil
    var ownsProcessGroup = true
}

struct CommandResult {
    let exitCode: Int32?
    let output: String
    let timedOut: Bool
    let launchError: String?

    var succeeded: Bool { exitCode == 0 && !timedOut && launchError == nil }
}

protocol SetupCommandRunning: AnyObject {
    var progress: ((String) -> Void)? { get set }
    func run(_ command: SetupCommand, timeout: TimeInterval, completion: @escaping (CommandResult) -> Void)
}

/// Top-level probes own a process group. Native helper tool probes inherit that
/// owned group, so outer timeout also stops nested shell/tool children.
/// All commands have separate arguments. No shell command text is constructed.
final class NativeCommandRunner: SetupCommandRunning {
    var progress: ((String) -> Void)?
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
                  posix_spawnattr_setflags(&attributes, Int16((command.ownsProcessGroup ? POSIX_SPAWN_SETPGROUP : 0) | POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_SETSIGDEF)) == 0,
                  posix_spawnattr_setpgroup(&attributes, 0) == 0 else {
                close(descriptors[0]); close(descriptors[1])
                DispatchQueue.main.async { completion(CommandResult(exitCode: nil, output: "", timedOut: false, launchError: "Could not prepare the check process signal state.")) }
                return
            }
            let arguments = ([command.executable] + command.arguments).map { strdup($0) } + [nil]
            let environment = (command.environment ?? ProcessInfo.processInfo.environment).map { strdup("\($0.key)=\($0.value)") } + [nil]
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

            let state = ProbeState(pid: pid, ownsProcessGroup: command.ownsProcessGroup)
            let output = ProbeOutput()
            let reader = DispatchGroup()
            reader.enter()
            let readDescriptor = descriptors[0]
            let reportProgress = self.progress
            DispatchQueue.global(qos: .utility).async {
                var buffer = [UInt8](repeating: 0, count: 8192)
                var reachedEOF = false
                var progressBuffer = ""
                var progressCount = 0
                var lastProgress = ""
                while output.canRead {
                    let count = read(readDescriptor, &buffer, buffer.count)
                    if count > 0 {
                        output.append(buffer, count: count)
                        progressBuffer += String(decoding: buffer.prefix(count), as: UTF8.self)
                        while let newline = progressBuffer.firstIndex(of: "\n") {
                            let line = String(progressBuffer[..<newline]); progressBuffer.removeSubrange(...newline)
                            if line.hasPrefix("ZERO_PROGRESS=") {
                                let token = String(line.dropFirst(14))
                                if progressCount < 32, token != lastProgress,
                                   ["java", "editor", "settings", "zero", "redhat", "verify"].contains(token) {
                                    progressCount += 1; lastProgress = token
                                    DispatchQueue.main.async { reportProgress?(token) }
                                }
                            }
                        }
                        if progressBuffer.utf8.count > 4096 { progressBuffer = "" }
                    }
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
            if command.ownsProcessGroup { kill(-pid, SIGKILL) }
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
    let ownsProcessGroup: Bool
    var finished = false
    var timedOut = false
    init(pid: pid_t, ownsProcessGroup: Bool) { self.pid = pid; self.ownsProcessGroup = ownsProcessGroup }
    func expire() -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard !finished else { return false }
        timedOut = true
        kill(ownsProcessGroup ? -pid : pid, SIGTERM)
        return true
    }
    func forceStop() {
        lock.lock(); defer { lock.unlock() }
        if !finished { kill(ownsProcessGroup ? -pid : pid, SIGKILL) }
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
        try KitUpdatePlan.realDirectory(parent)
        let canonicalParent = parent
        var directory: ObjCBool = false
        guard manager.fileExists(atPath: canonicalParent.path, isDirectory: &directory), directory.boolValue,
              manager.isWritableFile(atPath: canonicalParent.path) else {
            throw SetupFailure(message: "Your home must be an existing writable folder. Check its permissions, then retry.")
        }
        let parentIdentity = try KitUpdatePlan.identity(canonicalParent)!
        let parentFD = open(canonicalParent.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard parentFD >= 0 else { throw SetupFailure(message: "Cannot open your home folder. Check permissions, then retry.") }
        defer { close(parentFD) }
        let destination = canonicalParent.appendingPathComponent(name, isDirectory: true)
        var info = stat()
        guard lstat(destination.path, &info) != 0 && errno == ENOENT else {
            throw SetupFailure(message: "The Zero folder already exists. Check it and retry setup.")
        }
        var template = Array(canonicalParent.appendingPathComponent(".zero-setup-XXXXXX").path.utf8CString)
        guard let temporaryPath = mkdtemp(&template) else {
            throw SetupFailure(message: "Could not prepare setup in your home folder. Check its permissions, then retry.")
        }
        let temporary = URL(fileURLWithPath: String(cString: temporaryPath), isDirectory: true)
        defer { try? manager.removeItem(at: temporary) }
        let staging = temporary.appendingPathComponent("kit", isDirectory: true)
        // The private, exclusively created container owns all partial copies.
        try manager.copyItem(at: root, to: staging)
        try beforePublish?()
        try KitUpdatePlan.realDirectory(canonicalParent)
        guard let current = try KitUpdatePlan.identity(canonicalParent), parentIdentity.sameDirectory(current),
              fstat(parentFD, &info) == 0, parentIdentity.sameDirectory(KitUpdatePlan.Identity(info)) else {
            throw SetupFailure(message: "Your home folder changed during setup. Review it and retry.")
        }
        guard renameatx_np(AT_FDCWD, staging.path, parentFD, name, UInt32(RENAME_EXCL)) == 0 else {
            if errno == EEXIST || errno == ENOTEMPTY {
                throw SetupFailure(message: "The Zero folder appeared during setup. It was preserved. Check it and retry setup.")
            }
            throw SetupFailure(message: "Could not place the kit: \(String(cString: strerror(errno))). Check your home folder permissions, then retry.")
        }
        return destination
    }

    private func rejectSymlink(_ url: URL) throws {
        var info = stat()
        guard lstat(url.path, &info) == 0 else { throw SetupFailure(message: "Cannot read \(url.lastPathComponent).") }
        guard (info.st_mode & S_IFMT) != S_IFLNK else {
            throw SetupFailure(message: "Symbolic links are not supported by Zero Setup. Review your home/Zero folder and ask for help.")
        }
    }
}

/// The native UI always targets the owner's home/Zero. Inspection never writes.
struct DefaultSetupLocation {
    let home: URL
    static func entryMode(_ url: URL) throws -> mode_t? {
        var info = stat()
        if lstat(url.path, &info) == 0 { return info.st_mode }
        if errno == ENOENT { return nil }
        throw SetupFailure(message: "Cannot inspect your Zero folder. Check home folder permissions, then retry.")
    }
    func destination() throws -> URL {
        try KitUpdatePlan.realDirectory(home)
        guard access(home.path, W_OK | X_OK) == 0 else {
            throw SetupFailure(message: "Your home must be an existing writable real folder. Check its permissions, then retry.")
        }
        return home.appendingPathComponent("Zero", isDirectory: true)
    }
}

/// A read-only, identity-bound proposal. Only installer runtime paths are touched;
/// starter, optional and all other entries belong to the student.
struct KitUpdatePlan {
    struct Identity: Equatable {
        let device: dev_t, inode: ino_t, mode: mode_t, size: off_t
        let modified: timespec
        static func == (a: Identity, b: Identity) -> Bool {
            a.device == b.device && a.inode == b.inode && a.mode == b.mode && a.size == b.size &&
            a.modified.tv_sec == b.modified.tv_sec && a.modified.tv_nsec == b.modified.tv_nsec
        }
        init(_ info: stat) { device = info.st_dev; inode = info.st_ino; mode = info.st_mode; size = info.st_size; modified = info.st_mtimespec }
        func sameDirectory(_ other: Identity) -> Bool { device == other.device && inode == other.inode && (other.mode & S_IFMT) == S_IFDIR }
    }
    static let runtime = ["setup/Setup.cmd", "setup/Setup.ps1", "setup/Setup.command", "setup/setup.sh", "setup/mac-downloads.json", "setup/README.md", "START-HERE.md", "LICENSE"]
    static let markers = ["START-HERE.md", "setup/setup.sh", "setup/Setup.command", "setup/kit.properties", "starter/zero.json", "starter/pom.xml", "starter/mvnw", "starter/mvnw.cmd", "starter/.mvn/wrapper/maven-wrapper.properties", "starter/.vscode/tasks.json"]
    let destination: URL
    let homeIdentity: Identity, rootIdentity: Identity, setupIdentity: Identity
    let files: [String]
    let originals: [String: Identity]
    let markerIdentities: [String: Identity]
    static func identity(_ url: URL) throws -> Identity? {
        var info = stat()
        if lstat(url.path, &info) == 0 { return Identity(info) }
        if errno == ENOENT { return nil }
        throw SetupFailure(message: "Cannot inspect \(url.path). Check its permissions.")
    }
    static func realDirectory(_ url: URL) throws {
        var current = url
        while current.path != "/" {
            guard let info = try identity(current), (info.mode & S_IFMT) == S_IFDIR else {
                throw SetupFailure(message: "Use an existing real folder. Files and symbolic links are not supported: \(current.path).")
            }
            current.deleteLastPathComponent()
        }
    }
    static func regular(_ url: URL) throws -> Identity {
        try realDirectory(url.deletingLastPathComponent())
        guard let info = try identity(url), (info.mode & S_IFMT) == S_IFREG else {
            throw SetupFailure(message: "Existing Zero is not a recognizable complete kit: \(url.path). Your files were kept.")
        }
        return info
    }
    static func version(_ root: URL) throws -> String {
        _ = try regular(root.appendingPathComponent("setup/kit.properties"))
        let metadata = try String(contentsOf: root.appendingPathComponent("setup/kit.properties"), encoding: .utf8)
        let entries = metadata.components(separatedBy: .newlines).filter { $0.hasPrefix("kitVersion=") }
        guard entries.count == 1 else { throw SetupFailure(message: "Existing Zero kit metadata is invalid. Your files were kept.") }
        let version = String(entries[0].dropFirst(11))
        guard version.range(of: #"^[0-9]+\.[0-9]+\.[0-9]+$"#, options: .regularExpression) != nil else {
            throw SetupFailure(message: "Existing Zero kit version is invalid. Your files were kept.")
        }
        _ = try regular(root.appendingPathComponent("zero-\(version).vsix"))
        return version
    }
    static func validateInstalled(_ root: URL) throws {
        try realDirectory(root)
        for name in markers { _ = try regular(root.appendingPathComponent(name)) }
        _ = try version(root)
    }
    init(kit: SetupKit, destination: URL) throws {
        try kit.validate()
        try Self.validateInstalled(destination)
        self.destination = destination
        homeIdentity = try Self.identity(destination.deletingLastPathComponent())!
        rootIdentity = try Self.identity(destination)!
        setupIdentity = try Self.identity(destination.appendingPathComponent("setup"))!
        files = Self.runtime + ["zero-\(try Self.version(kit.root)).vsix", "setup/kit.properties"] // metadata last
        var old: [String: Identity] = [:]
        for name in files {
            _ = try Self.regular(kit.root.appendingPathComponent(name))
            let path = destination.appendingPathComponent(name)
            try Self.realDirectory(path.deletingLastPathComponent())
            if let info = try Self.identity(path) {
                guard (info.mode & S_IFMT) == S_IFREG else { throw SetupFailure(message: "Cannot replace \(name): it is not a regular setup file. Your files were kept.") }
                old[name] = info
            }
        }
        originals = old
        var markers: [String: Identity] = [:]
        for name in Self.markers + ["zero-\(try Self.version(destination)).vsix"] { markers[name] = try Self.regular(destination.appendingPathComponent(name)) }
        markerIdentities = markers
    }
    func recheckDirectories() throws {
        let home = destination.deletingLastPathComponent()
        try Self.realDirectory(home)
        guard let h = try Self.identity(home), homeIdentity.sameDirectory(h),
              let r = try Self.identity(destination), rootIdentity.sameDirectory(r),
              let s = try Self.identity(destination.appendingPathComponent("setup")), setupIdentity.sameDirectory(s) else {
            throw SetupFailure(message: "Your Zero folder changed during setup. Review it and try again.")
        }
    }
    func recheck() throws {
        try recheckDirectories()
        for (name, old) in markerIdentities {
            guard try Self.regular(destination.appendingPathComponent(name)) == old else { throw SetupFailure(message: "Your Zero kit changed during preparation. Review it and try again.") }
        }
        for name in files {
            guard try Self.identity(destination.appendingPathComponent(name)) == originals[name] else { throw SetupFailure(message: "Setup file \(name) changed during preparation. Try again.") }
        }
    }
    /// Reopening a current installation is read-only. Compare only our fixed
    /// runtime paths, through anchored handles; student files are never compared.
    func matches(_ kit: SetupKit) throws -> Bool {
        try recheck()
        let rootFD = open(destination.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard rootFD >= 0 else { throw SetupFailure(message: "Cannot inspect your Zero folder.") }
        defer { close(rootFD) }
        let setupFD = openat(rootFD, "setup", O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard setupFD >= 0 else { throw SetupFailure(message: "Cannot inspect Zero's setup files.") }
        defer { close(setupFD) }
        var info = stat()
        guard fstat(rootFD, &info) == 0, rootIdentity.sameDirectory(Identity(info)),
              fstat(setupFD, &info) == 0, setupIdentity.sameDirectory(Identity(info)) else {
            throw SetupFailure(message: "Your Zero folder changed. Try again.")
        }
        for name in files {
            let bundled = kit.root.appendingPathComponent(name)
            let source = try Self.regular(bundled)
            guard let old = originals[name], old.size == source.size,
                  old.mode & 0o777 == source.mode & 0o777 else { return false }
            let parent = name.hasPrefix("setup/") ? setupFD : rootFD
            let leaf = name.hasPrefix("setup/") ? String(name.dropFirst(6)) : name
            let fileFD = openat(parent, leaf, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
            guard fileFD >= 0 else { throw SetupFailure(message: "Cannot inspect \(name).") }
            let handle = FileHandle(fileDescriptor: fileFD, closeOnDealloc: true)
            guard fstat(fileFD, &info) == 0, Identity(info) == old else { throw SetupFailure(message: "Zero's setup files changed. Try again.") }
            let sourceFD = open(bundled.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
            guard sourceFD >= 0 else { throw SetupFailure(message: "Cannot inspect the bundled kit.") }
            let reference = FileHandle(fileDescriptor: sourceFD, closeOnDealloc: true)
            defer { try? reference.close() }
            guard fstat(sourceFD, &info) == 0, Identity(info) == source else { throw SetupFailure(message: "The bundled kit changed. Open Zero again.") }
            var remaining = source.size
            while remaining > 0 {
                let count = Int(min(remaining, 65536))
                let actual = try handle.read(upToCount: count) ?? Data()
                let expected = try reference.read(upToCount: count) ?? Data()
                guard actual.count == count, expected.count == count, actual == expected else { return false }
                remaining -= off_t(count)
            }
            guard fstat(fileFD, &info) == 0, Identity(info) == old,
                  fstat(sourceFD, &info) == 0, Identity(info) == source,
                  try Self.regular(bundled) == source else { throw SetupFailure(message: "Zero's setup files changed during checking. Try again.") }
        }
        try recheck()
        return true
    }
    /// Anchored directory handles prevent symlink ancestor replacement from
    /// redirecting writes. A directory flock serializes cooperating installers.
    func update(from kit: SetupKit, beforeCommit: (() throws -> Void)? = nil,
                afterReplace: ((String) throws -> Void)? = nil) throws -> URL {
        try kit.validate(); try recheck()
        let rootFD = open(destination.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard rootFD >= 0 else { throw SetupFailure(message: "Cannot open your Zero folder for updating.") }
        defer { close(rootFD) }
        guard flock(rootFD, LOCK_EX | LOCK_NB) == 0 else { throw SetupFailure(message: "Another Zero update is running. Wait for it to finish, then retry.") }
        defer { flock(rootFD, LOCK_UN) }
        let setupFD = openat(rootFD, "setup", O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard setupFD >= 0 else { throw SetupFailure(message: "Cannot open the existing setup folder.") }
        defer { close(setupFD) }
        var info = stat()
        guard fstat(rootFD, &info) == 0, rootIdentity.sameDirectory(Identity(info)),
              fstat(setupFD, &info) == 0, setupIdentity.sameDirectory(Identity(info)) else { throw SetupFailure(message: "Your Zero folder changed. Try again.") }
        let homeFD = open(destination.deletingLastPathComponent().path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard homeFD >= 0 else { throw SetupFailure(message: "Cannot open your home folder for updating.") }
        defer { close(homeFD) }
        guard fstat(homeFD, &info) == 0, homeIdentity.sameDirectory(Identity(info)) else { throw SetupFailure(message: "Your home folder changed. Try again.") }
        let backupName = ".zero-setup-backup-\(UUID().uuidString)"
        let backup = destination.deletingLastPathComponent().appendingPathComponent(backupName)
        guard mkdirat(homeFD, backupName, 0o700) == 0 else { throw SetupFailure(message: "Cannot create a setup backup in your home. Check permissions, then retry.") }
        let backupFD = openat(homeFD, backupName, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard backupFD >= 0 else { throw SetupFailure(message: "Cannot open setup backup: \(backup.path)") }
        defer { close(backupFD) }
        guard mkdirat(backupFD, "new", 0o700) == 0, mkdirat(backupFD, "previous", 0o700) == 0 else { throw SetupFailure(message: "Cannot prepare setup backup: \(backup.path)") }
        let stagedFD = openat(backupFD, "new", O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        let savedFD = openat(backupFD, "previous", O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard stagedFD >= 0, savedFD >= 0 else {
            if stagedFD >= 0 { close(stagedFD) }; if savedFD >= 0 { close(savedFD) }
            throw SetupFailure(message: "Cannot open setup backup folders: \(backup.path)")
        }
        defer { close(stagedFD); close(savedFD) }
        func writePrivate(_ bytes: Data, fd: Int32, leaf: String, mode: mode_t) throws {
            let file = openat(fd, leaf, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode & 0o777)
            guard file >= 0 else { throw SetupFailure(message: "Cannot write setup backup file \(leaf).") }
            let handle = FileHandle(fileDescriptor: file, closeOnDealloc: true)
            try handle.write(contentsOf: bytes)
            guard fsync(file) == 0 else { throw SetupFailure(message: "Cannot finish writing setup backup file \(leaf).") }
        }
        // Flatten only our fixed paths inside the private transaction folder.
        func flat(_ name: String) -> String { name.replacingOccurrences(of: "/", with: "_") }
        func target(_ name: String) -> (Int32, String) { name.hasPrefix("setup/") ? (setupFD, String(name.dropFirst(6))) : (rootFD, name) }
        var replaced: [String] = []
        do {
            for name in files {
                let bundled = kit.root.appendingPathComponent(name)
                let sourceInfo = try Self.regular(bundled)
                try writePrivate(Data(contentsOf: bundled), fd: stagedFD, leaf: flat(name), mode: sourceInfo.mode)
                if let old = originals[name] {
                    let (fd, leaf) = target(name)
                    let fileFD = openat(fd, leaf, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
                    guard fileFD >= 0 else { throw SetupFailure(message: "Cannot back up \(name).") }
                    let handle = FileHandle(fileDescriptor: fileFD, closeOnDealloc: true)
                    guard fstat(fileFD, &info) == 0, Identity(info) == old else { throw SetupFailure(message: "Setup files changed while preparing the backup.") }
                    let bytes = try handle.readToEnd() ?? Data()
                    guard fstat(fileFD, &info) == 0, Identity(info) == old else { throw SetupFailure(message: "Setup file changed while being backed up.") }
                    try writePrivate(bytes, fd: savedFD, leaf: flat(name), mode: old.mode)
                }
            }
            try beforeCommit?(); try recheck()
            for name in files {
                try recheckDirectories()
                let (fd, leaf) = target(name)
                let source = flat(name)
                var current = stat()
                let exists = fstatat(fd, leaf, &current, AT_SYMLINK_NOFOLLOW) == 0
                guard (exists ? Identity(current) : nil) == originals[name] else { throw SetupFailure(message: "Setup file \(name) changed during updating.") }
                // Exclusive publication protects newly added files; exchange keeps
                // the actual replaced entry available even if an external writer races.
                let flags = originals[name] == nil ? UInt32(RENAME_EXCL) : UInt32(RENAME_SWAP)
                guard renameatx_np(stagedFD, source, fd, leaf, flags) == 0 else { throw SetupFailure(message: "Could not replace \(name): \(String(cString: strerror(errno))).") }
                replaced.append(name)
                if let old = originals[name] {
                    guard fstatat(stagedFD, source, &current, AT_SYMLINK_NOFOLLOW) == 0, Identity(current) == old else { throw SetupFailure(message: "A setup file changed during replacement. Restoring the previous files.") }
                }
                try afterReplace?(name)
            }
            try recheckDirectories()
            for name in files { unlinkat(stagedFD, flat(name), 0) }
            unlinkat(backupFD, "new", AT_REMOVEDIR)
            return backup
        } catch {
            var restored = true
            for name in replaced.reversed() {
                let (fd, leaf) = target(name)
                let source = flat(name)
                // Exchanged entries are the exact previous files, not reconstructed
                // student data. Keep both versions if restoration cannot complete.
                if originals[name] != nil {
                    if renameatx_np(stagedFD, source, fd, leaf, UInt32(RENAME_SWAP)) != 0 { restored = false }
                } else if renameatx_np(fd, leaf, stagedFD, source, UInt32(RENAME_EXCL)) != 0 { restored = false }
            }
            throw SetupFailure(message: "\(error.localizedDescription) \(restored ? "Previous setup files were restored." : "Restoration was incomplete; keep the backup and ask for help.") Backup: \(backup.path)")
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
        let keys: Set<String> = ["kit", "code", "java", "node", "profile", "zero", "redhat", "javaHomeBlocked", "ready"]
        guard Set(fields.keys) == keys, fields.values.allSatisfy({ $0 == "0" || $0 == "1" }) else {
            throw SetupFailure(message: "Invalid setup check response.")
        }
        let snapshot = SetupSnapshot(fields: fields.mapValues { $0 == "1" })
        let complete = ["kit", "code", "java", "node", "profile", "zero", "redhat"].allSatisfy { snapshot[$0] }
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

enum SetupStage: Equatable {
    case checking, ready, retry, opened
}

final class SetupController {
    let kit: SetupKit
    let runner: SetupCommandRunning
    let defaultLocation: DefaultSetupLocation
    private(set) var selectedFolder: URL?
    private(set) var busy = false
    static let totalSteps = 9
    private(set) var completedSteps = 0
    private var configuring = false
    private var automaticOpenAttempted = false
    private var retryOpening = false
    private var hasOpened = false
    private var restoringSession = false
    private var repairOnLaunch = false
    private(set) var hasChecked = false
    private(set) var stage: SetupStage = .checking
    private(set) var summary = "Preparing Zero…"
    private(set) var diagnostics = "Set up Zero prepares ~/Zero and a separate editor configuration in ~/Library/Application Support/Zero. Missing VS Code and JDK 21 are downloaded from official pinned URLs and verified. Zero and Java support are installed in that separate editor. Git is optional; GitHub sign-in and sharing are separate. Existing editor profiles and student files are preserved. Workspace trust and system security prompts remain yours to approve.\n"
    private var snapshot: SetupSnapshot?
    var changed: (() -> Void)?
    var opened: (() -> Void)?
    var mayBeginWork: () -> Bool = { true }

    init(kit: SetupKit, runner: SetupCommandRunning = NativeCommandRunner(),
         home: URL = FileManager.default.homeDirectoryForCurrentUser) {
        self.kit = kit; self.runner = runner; defaultLocation = DefaultSetupLocation(home: home)
        runner.progress = { [weak self] token in self?.reportProgress(token) }
    }

    private func reportProgress(_ token: String) {
        // Each token starts a stage after the preceding stages succeeded. Already
        // installed extensions may skip tokens; verification confirms those steps.
        let steps = ["java": (2, "Preparing Java…"), "editor": (3, "Preparing Zero editor…"),
                     "settings": (4, "Preparing Zero settings…"), "zero": (5, "Installing Zero support…"),
                     "redhat": (6, "Installing Java support…"), "verify": (7, "Checking Zero is ready…")]
        guard busy, configuring, let (completed, message) = steps[token], completed >= completedSteps else { return }
        completedSteps = completed; summary = message; changed?()
    }


    var primaryTitle: String {
        switch stage {
        case .checking: return "Please wait"
        case .retry: return "Try again"
        case .ready: return "Open Zero"
        case .opened: return "Open Zero again"
        }
    }
    private func set(_ next: SetupStage, _ message: String) { stage = next; summary = message; changed?() }
    private func record(_ text: String) {
        diagnostics += text + "\n"
        if diagnostics.utf8.count > 1024 * 1024 { diagnostics = String(diagnostics.suffix(512 * 1024)) }
    }
    private func fail(_ message: String, detail: String) {
        snapshot = nil; busy = false; configuring = false; record(detail); set(.retry, message)
    }
    private func run(_ arguments: [String], status: String, timeout: TimeInterval = 180, completion: @escaping (CommandResult) -> Void) {
        guard mayBeginWork() else { return }
        do {
            let current = SetupKit(root: selectedFolder ?? kit.root)
            if selectedFolder == nil { try current.validate() } else { try KitUpdatePlan.validateInstalled(current.root) }
            busy = true; summary = status; changed?()
            let command = SetupCommand(executable: Bundle.main.executableURL!.path, arguments: ["--runtime", current.root.path] + arguments)
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
    func launch() {
        guard mayBeginWork(), !busy, !hasChecked, selectedFolder == nil else { return }
        busy = true; summary = "Opening Zero…"; changed?()
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let result = Result { () throws -> URL? in
                try kit.validate()
                let destination = try defaultLocation.destination()
                guard try DefaultSetupLocation.entryMode(destination) != nil else { return nil }
                let plan = try KitUpdatePlan(kit: kit, destination: destination)
                return try plan.matches(kit) ? destination : nil
            }
            DispatchQueue.main.async {
                self.busy = false
                switch result {
                case .success(let current):
                    if let current {
                        self.selectedFolder = current; self.restoringSession = true
                        self.repairOnLaunch = true; self.completedSteps = 8
                    }
                    self.check()
                case .failure(let error): self.fail("Cannot open Zero. See Details for help.", detail: error.localizedDescription)
                }
            }
        }
    }
    func check() {
        guard mayBeginWork(), !busy else { return }
        snapshot = nil; stage = .checking
        if selectedFolder == nil { completedSteps = 0 }
        else if completedSteps == Self.totalSteps { completedSteps -= 1 }
        run(["--native-check"], status: restoringSession ? "Opening Zero…" : "Preparing Zero…") { [weak self] result in
            guard let self else { return }
            self.hasChecked = true
            do {
                self.snapshot = try SetupSnapshot.parse(result.output)
                guard self.snapshot?["kit"] == true else { self.fail("The kit is incomplete. See Details.", detail: "Kit metadata or required files are incomplete."); return }
                if self.selectedFolder == nil { self.completedSteps = 1; self.prepareDefaultLocation(); return }
                if self.repairOnLaunch {
                    self.repairOnLaunch = false
                    if self.snapshot?.ready != true { self.configure(); return }
                }
                self.advance()
            } catch { self.fail("The check was incomplete. Try again.", detail: error.localizedDescription) }
        }
    }
    private func advance() {
        guard let snapshot else { return }
        guard snapshot["kit"] else { fail("The kit is incomplete. See Details.", detail: "Extract a complete Zero kit."); return }
        if !snapshot.ready {
            retryOpening = false
            set(.retry, "Finish setup to prepare the editor and Java.")
            return
        }
        guard snapshot.ready && selectedFolder != nil else { fail("Readiness is unverified. Try again.", detail: "Required check fields did not establish readiness."); return }
        completedSteps = Self.totalSteps
        if !automaticOpenAttempted {
            automaticOpenAttempted = true
            openZero()
        } else if retryOpening || !hasOpened {
            retryOpening = true
            set(.retry, "Zero is ready. Try again to open it.")
        } else {
            set(.opened, "In Zero, choose Run App to begin.")
        }
    }
    private func update(_ plan: KitUpdatePlan) {
        guard mayBeginWork() else { return }
        restoringSession = true
        busy = true; summary = "Preparing Zero…"; changed?()
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let result = Result { try plan.update(from: kit) }
            DispatchQueue.main.async {
                self.busy = false
                switch result {
                case .success(let backup):
                    self.selectedFolder = plan.destination
                    self.record("Kit folder: \(plan.destination.path)\nPrevious setup backup: \(backup.path)")
                    self.configure()
                case .failure(let error):
                    self.fail("Could not update Zero. Try again.", detail: error.localizedDescription)
                }
            }
        }
    }
    func primaryAction() {
        guard mayBeginWork(), !busy else { return }
        switch stage {
        case .retry:
            if retryOpening { openZero() }
            else if selectedFolder != nil { configure() } else { check() }
        case .ready, .opened:
            openZero()
        default: break
        }
    }
    private func openZero() {
        // The backend rechecks immediately before launch, catching drift. A
        // failed launch stays recoverable without repeating kit installation.
        retryOpening = true
        run([restoringSession ? "--native-resume" : "--native-open"], status: "Opening Zero…", timeout: 180) { [weak self] _ in
            self?.retryOpening = false
            self?.hasOpened = true
            self?.set(.opened, "In Zero, choose Run App to begin.")
            self?.opened?()
        }
    }
    func mayExit() -> Bool {
        guard busy else { return true }
        summary = "Please wait for setup to finish this step."; changed?(); return false
    }
    private func configure() {
        completedSteps = 2; configuring = true
        run(["--native-install", "--approved"], status: "Preparing Zero editor and Java…", timeout: 3600) { [weak self] _ in
            guard let self else { return }
            self.configuring = false; self.completedSteps = 8; self.check()
        }
    }
    private func prepareDefaultLocation() {
        do {
            let destination = try defaultLocation.destination()
            if try DefaultSetupLocation.entryMode(destination) == nil {
                place(parent: defaultLocation.home, name: "Zero")
            } else {
                // Only installer-owned files are refreshed. The update plan retains
                // its identity/race checks, backups and complete project preservation.
                update(try KitUpdatePlan(kit: kit, destination: destination))
            }
        } catch {
            fail("Cannot prepare ~/Zero. See Details for help.", detail: error.localizedDescription)
        }
    }
    func place(parent: URL?, name: String?) {
        guard mayBeginWork(), !busy, selectedFolder == nil, let parent, let name else { return }
        busy = true; summary = "Preparing your Zero folder…"; changed?()
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let result = Result { try kit.place(parent: parent, name: name) }
            DispatchQueue.main.async {
                self.busy = false
                switch result {
                case .success(let folder): self.selectedFolder = folder; self.record("Kit folder: \(folder.path)"); self.configure()
                case .failure(let error): self.fail("Could not prepare Zero. Try again.", detail: error.localizedDescription)
                }
            }
        }
    }
}
