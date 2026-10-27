import Foundation
import Darwin

/// Native setup provisions private Java and browser runtimes. Students need no
/// global Node/package manager, profile import or global environment changes.
struct MacRuntime {
    static let fm = FileManager.default
    static let nodeVersion = "22.21.1"
    static let javaStartupVariables = ["JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS", "MAVEN_OPTS", "MAVEN_ARGS"]
    let kit: URL
    let home: URL
    let root: URL
    let assets: [String: Asset]
    let version: String
    let minimum: String
    #if ZERO_SETUP_TESTS
    var testDownload: ((URL, Asset) throws -> Void)?
    var testBeforePublish: (() throws -> Void)?
    var testAfterExchange: (() throws -> Void)?
    var testBeforeExchange: (() throws -> Void)?
    #endif
    struct Asset: Decodable { let url: String; let sha256: String; let format: String; let size: Int64; let version: String? }
    struct Manifest: Decodable { let schemaVersion: Int; let architectures: [String: [String: Asset]] }
    init(kit: URL, home: URL = fm.homeDirectoryForCurrentUser) throws {
        self.kit = kit; self.home = home
        root = home.appendingPathComponent("Library/Application Support/Zero")
        try KitUpdatePlan.validateInstalled(kit)
        let metadata = try String(contentsOf: kit.appendingPathComponent("setup/kit.properties"), encoding: .utf8)
        func value(_ key: String) -> String { metadata.components(separatedBy: .newlines).first { $0.hasPrefix(key + "=") }.map { String($0.dropFirst(key.count + 1)) } ?? "" }
        version = value("kitVersion"); minimum = value("vscodeMinimum")
        guard version.range(of: #"^\d+\.\d+\.\d+$"#, options: .regularExpression) != nil,
              minimum.range(of: #"^\d+\.\d+\.\d+$"#, options: .regularExpression) != nil else { throw SetupFailure(message: "Invalid kit versions.") }
        _ = try KitUpdatePlan.regular(kit.appendingPathComponent("setup/mac-downloads.json"))
        let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: kit.appendingPathComponent("setup/mac-downloads.json")))
        #if arch(arm64)
        let architecture = "arm64"
        #else
        let architecture = "x64"
        #endif
        guard manifest.schemaVersion == 1, let selected = manifest.architectures[architecture], Set(selected.keys) == ["jdk", "vscode", "node"] else { throw SetupFailure(message: "Missing downloads for this Mac.") }
        for (kind, asset) in selected {
            guard let url = URL(string: asset.url), url.scheme == "https", url.user == nil, url.password == nil,
                  (kind == "node" ? asset.version == Self.nodeVersion && asset.url == "https://nodejs.org/dist/v\(Self.nodeVersion)/node-v\(Self.nodeVersion)-darwin-\(architecture).tar.gz" : ["github.com", "update.code.visualstudio.com", "vscode.download.prss.microsoft.com"].contains(url.host ?? "")),
                  asset.sha256.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil,
                  asset.format == (kind == "vscode" ? "zip" : "tar.gz"), asset.size > 0, asset.size <= 600_000_000 else { throw SetupFailure(message: "Invalid verified download metadata.") }
        }
        assets = selected
    }
    var userData: URL { root.appendingPathComponent("editor/user-data") }
    var extensions: URL { root.appendingPathComponent("editor/extensions") }
    var jdk: URL { root.appendingPathComponent("runtime/jdk-" + assets["jdk"]!.sha256) }
    var editor: URL { root.appendingPathComponent("runtime/vscode-" + assets["vscode"]!.sha256) }
    var node: URL { root.appendingPathComponent("runtime/node-" + assets["node"]!.sha256) }
    var nodeDirectory: String { String(URL(string: assets["node"]!.url)!.lastPathComponent.dropLast(".tar.gz".count)) }
    var nodeBinary: URL { node.appendingPathComponent(nodeDirectory + "/bin/node") }
    var isolated: [String] { ["--user-data-dir", userData.path, "--extensions-dir", extensions.path] }
    func editorArguments(resuming: Bool) -> [String] {
        // With no folder/new-window argument VS Code restores its saved Zero
        // session. A fresh launch opens the tutorial welcome in an empty window.
        isolated + (resuming ? [] : ["--new-window"])
    }
    static func mkdir(_ url: URL) throws {
        if try KitUpdatePlan.identity(url) == nil {
            try mkdir(url.deletingLastPathComponent())
            guard Darwin.mkdir(url.path, 0o700) == 0 || errno == EEXIST else { throw SetupFailure(message: "Cannot create Zero's private folder: \(url.path).") }
        }
        try KitUpdatePlan.realDirectory(url)
        var info = stat()
        guard lstat(url.path, &info) == 0, !url.path.hasSuffix("/Zero") || (info.st_uid == getuid() && info.st_mode & 0o022 == 0) else { throw SetupFailure(message: "Zero's private folder must not be writable by other users.") }
    }
    static func execute(_ executable: String, _ arguments: [String], environment: [String: String]? = nil, timeout: TimeInterval = 30) throws -> String {
        var result: CommandResult?
        NativeCommandRunner().run(SetupCommand(executable: executable, arguments: arguments, environment: environment, ownsProcessGroup: false), timeout: timeout) { result = $0 }
        while result == nil { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
        guard let completed = result, completed.succeeded else { throw SetupFailure(message: "Command failed: \(executable)\n\(result?.output ?? "")") }
        return completed.output
    }
    static func atLeast(_ value: String, _ minimum: String) -> Bool {
        let a = value.split(separator: ".").compactMap { Int($0) }, b = minimum.split(separator: ".").compactMap { Int($0) }
        guard a.count == 3, b.count == 3 else { return false }
        return !a.lexicographicallyPrecedes(b)
    }
    func javaHome() throws -> URL? {
        guard try installed(jdk, asset: assets["jdk"]!) else { return nil }
        let contents = try Self.fm.contentsOfDirectory(at: jdk, includingPropertiesForKeys: nil)
        guard contents.count == 2, let folder = contents.first(where: { $0.lastPathComponent != ".zero-asset.json" }) else { throw SetupFailure(message: "Unexpected Java runtime contents.") }
        let home = folder.appendingPathComponent("Contents/Home")
        try KitUpdatePlan.realDirectory(home)
        let java = try Self.execute(home.appendingPathComponent("bin/java").path, ["-version"], environment: environment(home))
        let javac = try Self.execute(home.appendingPathComponent("bin/javac").path, ["-version"], environment: environment(home))
        guard java.contains("version \"21."), javac.hasPrefix("javac 21.") else { throw SetupFailure(message: "The private Java 21 runtime is incomplete.") }
        return home
    }
    func environment(_ java: URL) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        env["JAVA_HOME"] = java.path
        env["ZERO_JAVA_HOME"] = java.path
        for key in Self.javaStartupVariables { env.removeValue(forKey: key) }
        env["MAVEN_SKIP_RC"] = "1"
        env["ZERO_KIT_DIR"] = kit.path
        env["ZERO_NODE_EXECUTABLE"] = nodeBinary.path
        env["PATH"] = java.appendingPathComponent("bin").path + ":" + nodeBinary.deletingLastPathComponent().path + ":" + (env["PATH"] ?? "/usr/bin:/bin")
        env.removeValue(forKey: "NODE_OPTIONS"); env.removeValue(forKey: "NODE_PATH")
        // VS Code must run as an editor process, even if launched from another editor.
        env.removeValue(forKey: "ELECTRON_RUN_AS_NODE")
        return env
    }
    func editorCLI(_ java: URL?) throws -> URL? {
        var candidates = [home.appendingPathComponent("Applications/Visual Studio Code.app"), URL(fileURLWithPath: "/Applications/Visual Studio Code.app")]
        if try installed(editor, asset: assets["vscode"]!) { candidates.append(editor.appendingPathComponent("Visual Studio Code.app")) }
        for app in candidates {
            guard try KitUpdatePlan.identity(app) != nil else { continue }
            do {
                try KitUpdatePlan.realDirectory(app)
                let plist = app.appendingPathComponent("Contents/Info.plist")
                _ = try KitUpdatePlan.regular(plist)
                let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: plist), format: nil) as? [String: Any]
                if let required = info?["LSMinimumSystemVersion"] as? String {
                    let parts = required.split(separator: ".").compactMap { Int($0) }
                    guard parts.count >= 2, ProcessInfo.processInfo.isOperatingSystemAtLeast(OperatingSystemVersion(majorVersion: parts[0], minorVersion: parts[1], patchVersion: parts.count > 2 ? parts[2] : 0)) else { throw SetupFailure(message: "This VS Code download requires macOS \(required). Ask for help or update macOS.") }
                }
                let cli = app.appendingPathComponent("Contents/Resources/app/bin/code")
                _ = try KitUpdatePlan.regular(cli)
                let version = try Self.execute(cli.path, ["--version"], environment: java.map(environment)).components(separatedBy: .newlines)[0]
                if version.split(separator: ".").first == minimum.split(separator: ".").first && Self.atLeast(version, minimum) { return cli }
            } catch {
                if app.path.hasPrefix(editor.path + "/") { throw error }
                print("Existing editor unavailable: \(error.localizedDescription)")
            }
        }
        return nil
    }
    func installed(_ folder: URL, asset: Asset) throws -> Bool {
        guard try KitUpdatePlan.identity(folder) != nil else { return false }
        try KitUpdatePlan.realDirectory(folder)
        let receipt = folder.appendingPathComponent(".zero-asset.json")
        _ = try KitUpdatePlan.regular(receipt)
        let text = try String(contentsOf: receipt, encoding: .utf8)
        guard text == asset.sha256 else { throw SetupFailure(message: "The private Zero runtime has unrecognized contents; your files were kept.") }
        return true
    }
    func install(_ kind: String) throws {
        guard let asset = assets[kind] else { throw SetupFailure(message: "Unknown private runtime.") }
        let destination = kind == "jdk" ? jdk : kind == "node" ? node : editor
        if try installed(destination, asset: asset) { return }
        try Self.mkdir(root.appendingPathComponent("runtime"))
        let staging = root.appendingPathComponent("runtime/.install-" + UUID().uuidString)
        try Self.mkdir(staging)
        defer { try? Self.fm.removeItem(at: staging) }
        let download = staging.appendingPathComponent("download")
        print("Downloading verified \(kind == "jdk" ? "Java 21" : kind == "node" ? "browser tools" : "VS Code")…")
        #if ZERO_SETUP_TESTS
        if let testDownload { try testDownload(download, asset) } else { try downloadAsset(asset, to: download) }
        #else
        try downloadAsset(asset, to: download)
        #endif
        let measuredSize = try Self.fm.attributesOfItem(atPath: download.path)[.size] as? NSNumber
        guard measuredSize?.int64Value == asset.size else { throw SetupFailure(message: "Downloaded runtime has the wrong size. Retry setup.") }
        let digest = try Self.execute("/usr/bin/shasum", ["-a", "256", download.path]).split(separator: " ").first.map(String.init)
        guard digest == asset.sha256 else { throw SetupFailure(message: "The \(kind) download did not match its verified checksum. Retry setup.") }
        let extracted = staging.appendingPathComponent("extracted")
        try Self.mkdir(extracted)
        try SafeMacArchive.extract(download, to: extracted)
        try validateExtracted(extracted, kind: kind)
        try asset.sha256.write(to: extracted.appendingPathComponent(".zero-asset.json"), atomically: false, encoding: .utf8)
        // The owned staging and runtime parent stay real folders; never replace an
        // existing entry, even if another process appeared during download.
        try KitUpdatePlan.realDirectory(destination.deletingLastPathComponent())
        guard renameatx_np(AT_FDCWD, extracted.path, AT_FDCWD, destination.path, UInt32(RENAME_EXCL)) == 0 else { throw SetupFailure(message: "Runtime destination changed. Existing files were kept; retry setup.") }
    }
    func validateExtracted(_ folder: URL, kind: String) throws {
        let children = try Self.fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
        guard children.count == 1 else { throw SetupFailure(message: "Unexpected runtime archive layout.") }
        if kind == "jdk" {
            try verifyVendor(children[0], gatekeeper: false)
            let home = children[0].appendingPathComponent("Contents/Home")
            try KitUpdatePlan.realDirectory(home)
            for name in ["java", "javac"] { _ = try KitUpdatePlan.regular(home.appendingPathComponent("bin/" + name)) }
            guard try Self.execute(home.appendingPathComponent("bin/java").path, ["-version"], environment: environment(home)).contains("version \"21."),
                  try Self.execute(home.appendingPathComponent("bin/javac").path, ["-version"], environment: environment(home)).hasPrefix("javac 21.") else { throw SetupFailure(message: "Downloaded Java 21 is incomplete.") }
        } else if kind == "node" {
            guard children[0].lastPathComponent == nodeDirectory else { throw SetupFailure(message: "Unexpected browser runtime archive layout.") }
            _ = try verifyNodeBinary(children[0].appendingPathComponent("bin/node"))
        } else {
            guard children[0].lastPathComponent == "Visual Studio Code.app" else { throw SetupFailure(message: "Unexpected editor archive layout.") }
            try verifyVendor(children[0], gatekeeper: true)
            let plist = children[0].appendingPathComponent("Contents/Info.plist")
            _ = try KitUpdatePlan.regular(plist)
            let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: plist), format: nil) as? [String: Any]
            guard let required = info?["LSMinimumSystemVersion"] as? String else { throw SetupFailure(message: "The editor's macOS requirement is missing.") }
            let parts = required.split(separator: ".").compactMap { Int($0) }
            guard parts.count >= 2, ProcessInfo.processInfo.isOperatingSystemAtLeast(OperatingSystemVersion(majorVersion: parts[0], minorVersion: parts[1], patchVersion: parts.count > 2 ? parts[2] : 0)) else { throw SetupFailure(message: "VS Code requires macOS \(required). Ask for help or update macOS.") }
            _ = try KitUpdatePlan.regular(children[0].appendingPathComponent("Contents/Resources/app/bin/code"))
        }
    }
    func verifyVendor(_ bundle: URL, gatekeeper: Bool, team: String? = nil) throws {
        #if ZERO_SETUP_TESTS
        if testDownload != nil { return } // Explicit disposable fixtures only.
        #endif
        _ = try Self.execute("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle.path], timeout: 120)
        let identity = try Self.execute("/usr/bin/codesign", ["--display", "--verbose=4", bundle.path])
        guard identity.contains("Authority=Developer ID Application:"), identity.components(separatedBy: .newlines).contains("TeamIdentifier=" + (team ?? (gatekeeper ? "UBF8T346G9" : "JCDTMS22B4"))) else { throw SetupFailure(message: "The downloaded runtime lacks its developer signature.") }
        if gatekeeper { _ = try Self.execute("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=2", bundle.path], timeout: 120) }
    }
    func verifyNodeBinary(_ binary: URL) throws -> URL {
        _ = try KitUpdatePlan.regular(binary)
        try verifyVendor(binary, gatekeeper: false, team: "HX7739G8FX")
        var env = ProcessInfo.processInfo.environment
        for key in ["NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE"] { env.removeValue(forKey:key) }
        guard try Self.execute(binary.path,["--version"],environment:env).trimmingCharacters(in:.whitespacesAndNewlines) == "v" + Self.nodeVersion else {
            throw SetupFailure(message:"The private browser runtime could not be verified. Run setup again.")
        }
        return binary
    }
    func nodeExecutable() throws -> URL? {
        guard try installed(node,asset:assets["node"]!) else { return nil }
        let children = try Self.fm.contentsOfDirectory(at:node,includingPropertiesForKeys:nil)
        guard children.count == 2 else { throw SetupFailure(message:"Unexpected private browser runtime contents.") }
        try KitUpdatePlan.realDirectory(nodeBinary.deletingLastPathComponent())
        return try verifyNodeBinary(nodeBinary)
    }
    func nodeReady() -> Bool {
        do { return try nodeExecutable() != nil }
        catch { print("Private browser tools need repair: \(error.localizedDescription)"); return false }
    }
    func prepareNode() throws {
        let existed = try installed(node,asset:assets["node"]!)
        try install("node")
        do { guard try nodeExecutable() != nil else { throw SetupFailure(message:"Browser runtime setup was incomplete.") }; return }
        catch { if !existed { throw error } }
        // Replace only a recognized private folder. Keep the old bytes through
        // failed/offline repair, with exclusive publication in both directions.
        _ = try installed(node,asset:assets["node"]!)
        let previous = node.deletingLastPathComponent().appendingPathComponent(".repair-" + UUID().uuidString)
        guard renameatx_np(AT_FDCWD,node.path,AT_FDCWD,previous.path,UInt32(RENAME_EXCL)) == 0 else { throw SetupFailure(message:"The browser runtime changed; your files were kept.") }
        do {
            try install("node")
            guard try nodeExecutable() != nil else { throw SetupFailure(message:"Browser runtime repair was incomplete.") }
            _ = try installed(previous,asset:assets["node"]!)
            try Self.fm.removeItem(at:previous)
        } catch {
            if try KitUpdatePlan.identity(node) == nil {
                guard renameatx_np(AT_FDCWD,previous.path,AT_FDCWD,node.path,UInt32(RENAME_EXCL)) == 0 else { throw SetupFailure(message:"Browser runtime repair stopped; the previous private copy was kept at \(previous.path).") }
            }
            throw error
        }
    }
    func downloadAsset(_ asset: Asset, to download: URL) throws {
        _ = try Self.execute("/usr/bin/curl", ["--fail", "--location", "--silent", "--show-error", "--proto", "=https", "--proto-redir", "=https", "--connect-timeout", "20", "--max-time", "600", "--max-filesize", "600000000", "--retry", "2", "--retry-max-time", "900", "--output", download.path, asset.url], timeout: 950)
    }
    func seedSettings(_ java: URL) throws {
        let user = userData.appendingPathComponent("User")
        try Self.mkdir(user); try Self.mkdir(extensions)
        let publication = try AnchoredZeroFile(directory: user)
        let previous = try publication.identity("settings.json")
        let existing = try previous.map { try publication.read("settings.json", expected: $0) }
        var text = existing.flatMap { bytes -> String? in
            guard String(data: bytes, encoding: .utf8) != nil else { return nil }
            // Foundation's data-to-string initializer strips the BOM. Preserve
            // the validated original bytes for the surgical JSONC editor.
            return String(decoding: bytes, as: UTF8.self)
        }
        var values = text.flatMap { try? Self.readSettings($0) }
        if previous != nil && (text == nil || values == nil) {
            throw SetupFailure(message: "Zero's editor settings could not be read. Correct User/settings.json and retry setup; your file was kept.")
        }
        if previous == nil {
            #if ZERO_SETUP_TESTS
            let suppliedProfile = kit.appendingPathComponent("optional/Zero.code-profile")
            #else
            // Existing optional files in ~/Zero belong to the student and may have
            // been edited. Seed a new isolated editor from the installer payload.
            guard let resources = Bundle.main.resourceURL else { throw SetupFailure(message: "The supplied editor settings are unavailable.") }
            let suppliedProfile = resources.appendingPathComponent("kit/optional/Zero.code-profile")
            #endif
            _ = try KitUpdatePlan.regular(suppliedProfile)
            let profile = try JSONSerialization.jsonObject(with: Data(contentsOf: suppliedProfile)) as? [String: Any]
            guard let wrapper = profile?["settings"] as? String,
                  let wrapped = try JSONSerialization.jsonObject(with: Data(wrapper.utf8)) as? [String: String],
                  let plain = wrapped["settings"],
                  let supplied = try JSONSerialization.jsonObject(with: Data(plain.utf8)) as? [String: Any] else { throw SetupFailure(message: "The supplied editor settings are incomplete.") }
            values = supplied
            text = String(data: try JSONSerialization.data(withJSONObject: supplied, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)
        }
        let managed = managedSettings(java, existing: values!)
        let updated = try ZeroSettingsJSONC.updating(text!, changes: managed, removing: ["java.home", "java.jdt.ls.java.home"])
        guard updated != text else { return }
        let data = Data(updated.utf8)
        #if ZERO_SETUP_TESTS
        try publication.publish(data, leaf: "settings.json", mode: 0o600, expected: previous, beforeCommit: testBeforePublish, beforeExchange: testBeforeExchange, afterExchange: testAfterExchange)
        #else
        try publication.publish(data, leaf: "settings.json", mode: 0o600, expected: previous)
        #endif
    }
    static func readSettings(_ text: String) throws -> [String: Any] {
        guard let values = try JSONSerialization.jsonObject(with: Data(text.utf8), options: [.json5Allowed]) as? [String: Any] else { throw SetupFailure(message: "Zero's editor settings are incomplete.") }
        return values
    }
    func managedSettings(_ java: URL, existing: [String: Any]) -> [String: Any] {
        let path = java.appendingPathComponent("bin").path + ":${env:PATH}"
        var env = existing["terminal.integrated.env.osx"] as? [String: Any] ?? [:]
        env["JAVA_HOME"] = java.path; env["ZERO_JAVA_HOME"] = java.path; env["PATH"] = path
        env["MAVEN_SKIP_RC"] = "1"
        for key in Self.javaStartupVariables { env[key] = NSNull() }
        var profileEnv: [String: Any] = ["JAVA_HOME": java.path, "ZERO_JAVA_HOME": java.path, "PATH": path, "MAVEN_SKIP_RC": "1"]
        for key in Self.javaStartupVariables { profileEnv[key] = NSNull() }
        var profiles = existing["terminal.integrated.profiles.osx"] as? [String: Any] ?? [:]
        // Skip user startup files that could replace the private Java selection.
        profiles["Zero Java"] = ["path": "/bin/zsh", "args": ["-f"], "env": profileEnv]
        return ["java.configuration.runtimes": [["name": "JavaSE-21", "path": java.path, "default": true]],
                "java.import.gradle.java.home": java.path, "terminal.integrated.env.osx": env,
                "terminal.integrated.profiles.osx": profiles, "terminal.integrated.defaultProfile.osx": "Zero Java"]
    }
    func settingsReady(_ java: URL) throws -> Bool {
        let user = userData.appendingPathComponent("User")
        guard try KitUpdatePlan.identity(user) != nil else { return false }
        let publication = try AnchoredZeroFile(directory: user)
        guard let previous = try publication.identity("settings.json") else { return false }
        let bytes = try publication.read("settings.json", expected: previous)
        guard let text = String(data: bytes, encoding: .utf8), let values = try? Self.readSettings(text),
              values["java.home"] == nil, values["java.jdt.ls.java.home"] == nil else { return false }
        return managedSettings(java, existing: values).allSatisfy { key, value in
            guard let actual = values[key] else { return false }
            return NSDictionary(dictionary: ["value": actual]).isEqual(to: ["value": value])
        }
    }
    func extensionState(_ cli: URL, java: URL) throws -> [String: String] {
        let output = try Self.execute(cli.path, isolated + ["--list-extensions", "--show-versions"], environment: environment(java))
        var result: [String: String] = [:]
        for line in output.components(separatedBy: .newlines) { let pair = line.split(separator: "@"); if pair.count == 2 { result[String(pair[0]).lowercased()] = String(pair[1]) } }
        return result
    }
    func publishEditorUpdate() throws {
        // Written only after check() verified the supplied extension is installed.
        // The loaded Zero extension consumes this fixed marker in the private
        // profile and uses VS Code's normal Reload Window when its work is idle.
        let directory = root.appendingPathComponent("editor")
        let publication = try AnchoredZeroFile(directory: directory)
        let leaf = "update-ready.json"
        let previous = try publication.identity(leaf)
        if let previous {
            let bytes = try publication.read(leaf, expected: previous)
            guard let value = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
                  Set(value.keys) == ["schema", "version", "requestId"],
                  value["schema"] as? Int == 1,
                  let oldVersion = value["version"] as? String,
                  oldVersion.range(of: #"^\d{1,9}\.\d{1,9}\.\d{1,9}$"#, options: .regularExpression) != nil,
                  let request = value["requestId"] as? String, UUID(uuidString: request) != nil else {
                throw SetupFailure(message: "Zero's update marker is unrecognized; its contents were kept. See Details for help.")
            }
        }
        let bytes = try JSONSerialization.data(withJSONObject: ["schema": 1, "version": version, "requestId": UUID().uuidString], options: [.sortedKeys])
        try publication.publish(bytes, leaf: leaf, mode: 0o600, expected: previous)
    }
    func check() throws -> Bool {
        // Read-only: do not launch CLI with absent user-data-dir (it creates files).
        let java = try javaHome(); let node = nodeReady(); let cli = try editorCLI(java)
        let settingsConfigured = try java.map(settingsReady) ?? false
        let extensionsExist = try KitUpdatePlan.identity(extensions) != nil
        let configured = settingsConfigured && extensionsExist
        var state: [String: String] = [:]
        if configured, let java, let cli { _ = try KitUpdatePlan.regular(userData.appendingPathComponent("User/settings.json")); try KitUpdatePlan.realDirectory(extensions); state = try extensionState(cli, java: java) }
        let zero = Self.atLeast(state["zero.zero"] ?? "", version), redhat = state["redhat.java"] != nil
        let fields = ["kit": true, "code": cli != nil, "java": java != nil, "node":node, "profile": configured, "zero": zero, "redhat": redhat, "javaHomeBlocked": false, "ready": cli != nil && java != nil && node && configured && zero && redhat]
        print("ZERO_SETUP_V1\n" + fields.keys.sorted().map { "\($0)=\(fields[$0]! ? 1 : 0)" }.joined(separator: "\n") + "\nEND_ZERO_SETUP")
        return fields["ready"]!
    }
    static func progress(_ token: String) { print("ZERO_PROGRESS=" + token); fflush(stdout) }
    func configure() throws {
        try validateLauncher()
        try Self.mkdir(root)
        let lock = open(root.appendingPathComponent(".setup-lock").path, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
        guard lock >= 0 else { throw SetupFailure(message: "Cannot lock Zero's private runtime.") }
        defer { close(lock) }
        guard flock(lock, LOCK_EX | LOCK_NB) == 0 else { throw SetupFailure(message: "Another Zero setup is working. Wait and retry.") }
        Self.progress("java")
        try install("jdk")
        guard let java = try javaHome() else { throw SetupFailure(message: "Java setup was incomplete.") }
        try prepareNode()
        Self.progress("editor")
        if try editorCLI(java) == nil { try install("vscode") }
        guard let cli = try editorCLI(java) else { throw SetupFailure(message: "No compatible VS Code was found.") }
        Self.progress("settings")
        try seedSettings(java)
        let state = try extensionState(cli, java: java)
        for (id, target) in [("zero.zero", kit.appendingPathComponent("zero-\(version).vsix").path), ("redhat.java", "redhat.java")] {
            if id == "zero.zero" ? Self.atLeast(state[id] ?? "", version) : state[id] != nil { continue }
            Self.progress(id == "zero.zero" ? "zero" : "redhat")
            _ = try Self.execute(cli.path, isolated + ["--install-extension", target], environment: environment(java), timeout: 600)
        }
        Self.progress("verify")
        guard try check() else { throw SetupFailure(message: "Required editor support was not verified. Retry setup.") }
        try launcher(cli: cli, java: java)
    }
    static func quote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'" }
    func validateLauncher() throws {
        let publication = try AnchoredZeroFile(directory: kit)
        _ = try launcherIdentity(publication)
    }
    func launcherIdentity(_ publication: AnchoredZeroFile) throws -> KitUpdatePlan.Identity? {
        guard let identity = try publication.identity("Open Zero.command") else { return nil }
        let bytes = try publication.read("Open Zero.command", expected: identity)
        guard String(data: bytes, encoding: .utf8)?.hasPrefix("#!/bin/bash\n# Generated by Zero Setup.\n") == true else { throw SetupFailure(message: "Open Zero.command already belongs to you; your file was kept.") }
        return identity
    }
    func launcher(cli: URL, java: URL) throws {
        let publication = try AnchoredZeroFile(directory: kit)
        let previous = try launcherIdentity(publication)
        let text = "#!/bin/bash\n# Generated by Zero Setup.\nunset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_PATH JAVA_TOOL_OPTIONS JDK_JAVA_OPTIONS _JAVA_OPTIONS MAVEN_OPTS MAVEN_ARGS\nexport MAVEN_SKIP_RC=1\nexport JAVA_HOME=\(Self.quote(java.path))\nexport ZERO_JAVA_HOME=\(Self.quote(java.path))\nexport ZERO_KIT_DIR=\(Self.quote(kit.path))\nexport ZERO_NODE_EXECUTABLE=\(Self.quote(nodeBinary.path))\nexport PATH=\(Self.quote(java.appendingPathComponent("bin").path)):\(Self.quote(nodeBinary.deletingLastPathComponent().path)):\"$PATH\"\nexec \(Self.quote(cli.path)) \((isolated + ["--new-window"]).map(Self.quote).joined(separator: " "))\n"
        #if ZERO_SETUP_TESTS
        try publication.publish(Data(text.utf8), leaf: "Open Zero.command", mode: 0o755, expected: previous, beforeCommit: testBeforePublish, beforeExchange: testBeforeExchange, afterExchange: testAfterExchange)
        #else
        try publication.publish(Data(text.utf8), leaf: "Open Zero.command", mode: 0o755, expected: previous)
        #endif
    }
    static func main(_ arguments: [String]) -> Int32 {
        do {
            guard arguments.count >= 2 else { throw SetupFailure(message: "Invalid native setup action.") }
            let runtime = try MacRuntime(kit: URL(fileURLWithPath: arguments[0]))
            switch Array(arguments.dropFirst()) {
            case ["--native-check"]: _ = try runtime.check()
            case ["--native-install", "--approved"]: try runtime.configure()
            case ["--native-open"], ["--native-resume"]:
                guard try runtime.check(), let java = try runtime.javaHome(), let cli = try runtime.editorCLI(java) else { throw SetupFailure(message: "Readiness changed. Run setup again.") }
                try runtime.publishEditorUpdate()
                _ = try execute(cli.path, runtime.editorArguments(resuming: arguments.last == "--native-resume"), environment: runtime.environment(java))
            default: throw SetupFailure(message: "Invalid native setup action.")
            }
            return 0
        } catch { fputs("\(error.localizedDescription)\n", stderr); return 1 }
    }
}

/// Edit only managed top-level properties; preserve unrelated JSONC text/comments.
private enum ZeroSettingsJSONC {
    struct Member { let key: String; let start: Int; let value: Int; let end: Int; let comma: Int? }
    static func scan(_ bytes: [UInt8]) throws -> ([Member], Int) {
        // JSONSerialization accepts a UTF-8 BOM; retain it during text edits.
        var i = bytes.starts(with: [0xef, 0xbb, 0xbf]) ? 3 : 0
        func trivia() {
            while i < bytes.count {
                if [9, 10, 13, 32].contains(bytes[i]) { i += 1; continue }
                if i + 1 < bytes.count && bytes[i] == 47 && bytes[i + 1] == 47 {
                    i += 2; while i < bytes.count && bytes[i] != 10 { i += 1 }; continue
                }
                if i + 1 < bytes.count && bytes[i] == 47 && bytes[i + 1] == 42 {
                    i += 2; while i + 1 < bytes.count && !(bytes[i] == 42 && bytes[i + 1] == 47) { i += 1 }; i = min(i + 2, bytes.count); continue
                }
                break
            }
        }
        func quoted() throws {
            guard i < bytes.count && bytes[i] == 34 else { throw SetupFailure(message: "Use quoted JSON settings keys in Zero's editor settings.") }
            i += 1
            while i < bytes.count {
                if bytes[i] == 92 { i += 2 }
                else if bytes[i] == 34 { i += 1; return }
                else { i += 1 }
            }
            throw SetupFailure(message: "Zero's editor settings contain an incomplete string.")
        }
        trivia(); guard i < bytes.count && bytes[i] == 123 else { throw SetupFailure(message: "Zero's editor settings must be an object.") }; i += 1
        var members: [Member] = []
        while true {
            trivia(); guard i < bytes.count else { throw SetupFailure(message: "Zero's editor settings are incomplete.") }
            if bytes[i] == 125 { return (members, i) }
            let start = i; try quoted()
            guard let key = try JSONSerialization.jsonObject(with: Data(bytes[start..<i]), options: [.fragmentsAllowed]) as? String else { throw SetupFailure(message: "Invalid editor settings key.") }
            trivia(); guard i < bytes.count && bytes[i] == 58 else { throw SetupFailure(message: "Invalid editor setting.") }; i += 1; trivia()
            let value = i
            var depth = 0, end = i
            while i < bytes.count {
                trivia(); if i >= bytes.count { break }
                let ch = bytes[i]
                if depth == 0 && (ch == 44 || ch == 125) { break }
                if ch == 34 { try quoted() }
                else { if ch == 123 || ch == 91 { depth += 1 }; if ch == 125 || ch == 93 { depth -= 1 }; i += 1 }
                end = i
            }
            let comma = i < bytes.count && bytes[i] == 44 ? i : nil
            members.append(Member(key: key, start: start, value: value, end: end, comma: comma))
            if comma != nil { i += 1 }
        }
    }
    static func updating(_ original: String, changes: [String: Any], removing: [String]) throws -> String {
        var bytes = Array(original.utf8)
        // Validation happens before touching any existing file.
        _ = try MacRuntime.readSettings(original)
        for key in removing + changes.keys.sorted() {
            let (members, close) = try scan(bytes)
            let matching = members.filter { $0.key == key }
            // Repeated settings keys are ambiguous. Preserve them for correction.
            guard matching.count <= 1 else { throw SetupFailure(message: "Zero's editor settings repeat \(key). Remove the duplicate and retry.") }
            let encoded = try changes[key].map { try JSONSerialization.data(withJSONObject: $0, options: [.fragmentsAllowed, .sortedKeys]) }
            if let member = matching.first {
                if let encoded { bytes.replaceSubrange(member.value..<member.end, with: encoded) }
                else if let comma = member.comma { bytes.removeSubrange(member.start...comma) }
                else if let previous = members.dropLast().last?.comma { bytes.removeSubrange(previous..<member.end) }
                else { bytes.removeSubrange(member.start..<member.end) }
            } else if let encoded {
                let keyBytes = try JSONSerialization.data(withJSONObject: key, options: [.fragmentsAllowed])
                let separator = members.last.map { $0.comma == nil ? "," : "" } ?? ""
                let addition = Array((separator + "\n  ").utf8) + keyBytes + Array(": ".utf8) + encoded + Array("\n".utf8)
                bytes.insert(contentsOf: addition, at: close)
            }
        }
        let result = String(decoding: bytes, as: UTF8.self)
        _ = try MacRuntime.readSettings(result)
        return result
    }
}

/// Anchored staging and rename transactions never expose partially written files.
/// Exchanges retain the actual replaced entry until its identity is verified.
final class AnchoredZeroFile {
    let directory: URL
    let descriptor: Int32
    private let ancestors: [(URL, KitUpdatePlan.Identity)]
    init(directory: URL) throws {
        self.directory = directory
        try KitUpdatePlan.realDirectory(directory)
        var chain: [URL] = []
        var cursor = directory
        while cursor.path != "/" { chain.append(cursor); cursor.deleteLastPathComponent() }
        chain.append(cursor)
        var snapshots: [(URL, KitUpdatePlan.Identity)] = []
        var fd = open("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard fd >= 0 else { throw SetupFailure(message: "Cannot anchor the setup folder.") }
        do {
            for path in chain.reversed() {
                if path.path != "/" {
                    let next = openat(fd, path.lastPathComponent, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
                    guard next >= 0 else { throw SetupFailure(message: "A setup folder changed. Try again.") }
                    close(fd); fd = next
                }
                var info = stat()
                guard fstat(fd, &info) == 0, let visible = try KitUpdatePlan.identity(path), visible.sameDirectory(KitUpdatePlan.Identity(info)) else { throw SetupFailure(message: "A setup folder changed. Try again.") }
                snapshots.append((path, visible))
            }
            descriptor = fd; ancestors = snapshots
        } catch { close(fd); throw error }
    }
    deinit { close(descriptor) }
    func recheck() throws {
        for (path, expected) in ancestors {
            guard let current = try KitUpdatePlan.identity(path), expected.sameDirectory(current) else { throw SetupFailure(message: "A setup folder changed; your files were kept. Try again.") }
        }
        var info = stat()
        guard fstat(descriptor, &info) == 0, ancestors.last!.1.sameDirectory(KitUpdatePlan.Identity(info)) else { throw SetupFailure(message: "The setup folder changed. Try again.") }
    }
    func identity(_ leaf: String) throws -> KitUpdatePlan.Identity? {
        var info = stat()
        if fstatat(descriptor, leaf, &info, AT_SYMLINK_NOFOLLOW) == 0 { return KitUpdatePlan.Identity(info) }
        if errno == ENOENT { return nil }
        throw SetupFailure(message: "Cannot inspect \(leaf). Check permissions and retry.")
    }
    func regular(_ leaf: String) throws -> KitUpdatePlan.Identity {
        try recheck()
        guard let identity = try identity(leaf), identity.mode & S_IFMT == S_IFREG else { throw SetupFailure(message: "\(leaf) is not a regular file. Your files were kept.") }
        return identity
    }
    func read(_ leaf: String, expected: KitUpdatePlan.Identity) throws -> Data {
        try recheck()
        guard expected.mode & S_IFMT == S_IFREG, expected.size <= 1024 * 1024 else { throw SetupFailure(message: "Unrecognized launcher contents; your file was kept.") }
        let fd = openat(descriptor, leaf, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
        guard fd >= 0 else { throw SetupFailure(message: "The launcher changed. Your file was kept.") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        var info = stat()
        guard fstat(fd, &info) == 0, KitUpdatePlan.Identity(info) == expected else { throw SetupFailure(message: "The launcher changed. Your file was kept.") }
        let bytes = try handle.readToEnd() ?? Data()
        guard fstat(fd, &info) == 0, KitUpdatePlan.Identity(info) == expected, try identity(leaf) == expected else { throw SetupFailure(message: "The launcher changed while being checked. Your file was kept.") }
        return bytes
    }
    func publish(_ bytes: Data, leaf: String, mode: mode_t, expected: KitUpdatePlan.Identity?, beforeCommit: (() throws -> Void)? = nil, beforeExchange: (() throws -> Void)? = nil, afterExchange: (() throws -> Void)? = nil) throws {
        try recheck()
        let staged = ".zero-write-" + UUID().uuidString
        let fd = openat(descriptor, staged, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw SetupFailure(message: "Cannot prepare \(leaf). Try again.") }
        defer { close(fd) }
        var owned: KitUpdatePlan.Identity?
        var published = false
        var keepRecovery = false
        defer {
            // Only delete an entry that is still the file this operation owns.
            if !keepRecovery, let current = try? identity(staged), owned == nil || current == owned || current == expected { unlinkat(descriptor, staged, 0) }
        }
        do {
            try bytes.withUnsafeBytes { raw in
                var offset = 0
                while offset < raw.count {
                    let count = write(fd, raw.baseAddress!.advanced(by: offset), raw.count - offset)
                    if count < 0 && errno == EINTR { continue }
                    guard count > 0 else { throw SetupFailure(message: "Could not save \(leaf); retry setup. Existing files were kept.") }
                    offset += count
                }
            }
            guard fchmod(fd, mode) == 0, fsync(fd) == 0 else { throw SetupFailure(message: "Could not finish saving \(leaf). Retry setup.") }
            var info = stat()
            guard fstat(fd, &info) == 0 else { throw SetupFailure(message: "Cannot verify the staged file.") }
            owned = KitUpdatePlan.Identity(info)
            try beforeCommit?(); try recheck()
            guard try identity(leaf) == expected else { throw SetupFailure(message: "\(leaf) changed during setup. Your file was kept.") }
            try beforeExchange?()
            let flags = expected == nil ? UInt32(RENAME_EXCL) : UInt32(RENAME_SWAP)
            guard renameatx_np(descriptor, staged, descriptor, leaf, flags) == 0 else { throw SetupFailure(message: "\(leaf) changed during publication. Your files were kept.") }
            published = true
            try afterExchange?()
            if let expected { guard try identity(staged) == expected else { throw SetupFailure(message: "\(leaf) changed during replacement. Restoring your file.") } }
            try recheck()
            guard try identity(leaf) == owned else { throw SetupFailure(message: "\(leaf) changed immediately after publication. Your files were kept.") }
            // The complete file is now visible. Discard only the verified old
            // generated entry; initial settings never replace another entry.
        } catch {
            if published {
                if (try? identity(leaf)) != owned {
                    // Leave a later student edit at its chosen filename. Keep
                    // any exchanged previous entry as a separate recovery file.
                    keepRecovery = (try? identity(staged)) != nil
                } else {
                    let rollback = expected == nil ? UInt32(RENAME_EXCL) : UInt32(RENAME_SWAP)
                    if renameatx_np(descriptor, leaf, descriptor, staged, rollback) != 0 {
                        keepRecovery = true
                    } else if let current = try? identity(staged), current != owned {
                        // A concurrent edit raced restoration itself. Preserve
                        // that captured entry instead of discarding its bytes.
                        keepRecovery = true
                    }
                }
            }
            if keepRecovery { throw SetupFailure(message: "\(error.localizedDescription) Additional contents were preserved at \(directory.appendingPathComponent(staged).path).") }
            throw error
        }
    }
}

/// Use macOS's bundled libarchive to inspect and write each member ourselves.
/// Links are postponed until all ordinary files exist, so an archive can never
/// redirect extraction through a link. No vendor installer or tar subprocess runs.
struct SafeMacArchive {
    typealias Pointer = OpaquePointer
    static func extract(_ archive: URL, to root: URL) throws {
        guard let library = dlopen("/usr/lib/libarchive.2.dylib", RTLD_NOW) else { throw SetupFailure(message: "macOS archive support is unavailable.") }
        defer { dlclose(library) }
        func symbol<T>(_ name: String, _ type: T.Type) throws -> T {
            guard let address = dlsym(library, name) else { throw SetupFailure(message: "macOS archive support is incomplete.") }
            return unsafeBitCast(address, to: type)
        }
        let new = try symbol("archive_read_new", (@convention(c) () -> Pointer?).self)
        let filters = try symbol("archive_read_support_filter_all", (@convention(c) (Pointer) -> Int32).self)
        let formats = try symbol("archive_read_support_format_all", (@convention(c) (Pointer) -> Int32).self)
        let openArchive = try symbol("archive_read_open_filename", (@convention(c) (Pointer, UnsafePointer<CChar>, Int) -> Int32).self)
        let next = try symbol("archive_read_next_header", (@convention(c) (Pointer, UnsafeMutablePointer<Pointer?>) -> Int32).self)
        let pathname = try symbol("archive_entry_pathname", (@convention(c) (Pointer) -> UnsafePointer<CChar>?).self)
        let filetype = try symbol("archive_entry_filetype", (@convention(c) (Pointer) -> UInt32).self)
        let permission = try symbol("archive_entry_perm", (@convention(c) (Pointer) -> Int32).self)
        let symlink = try symbol("archive_entry_symlink", (@convention(c) (Pointer) -> UnsafePointer<CChar>?).self)
        let hardlink = try symbol("archive_entry_hardlink", (@convention(c) (Pointer) -> UnsafePointer<CChar>?).self)
        let size = try symbol("archive_entry_size", (@convention(c) (Pointer) -> Int64).self)
        let readData = try symbol("archive_read_data", (@convention(c) (Pointer, UnsafeMutableRawPointer, Int) -> Int).self)
        let free = try symbol("archive_read_free", (@convention(c) (Pointer) -> Int32).self)
        guard let reader = new() else { throw SetupFailure(message: "Cannot read archive.") }
        defer { _ = free(reader) }
        guard filters(reader) == 0, formats(reader) == 0, archive.path.withCString({ openArchive(reader, $0, 64 * 1024) }) == 0 else { throw SetupFailure(message: "The downloaded archive is unreadable.") }
        func relative(_ name: String) throws -> String {
            guard !name.hasPrefix("/"), !name.contains("\\"), !name.contains("\0"), !name.contains("\n"), !name.contains("\r") else { throw SetupFailure(message: "Unsafe archive path.") }
            let parts = name.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
            guard !parts.contains(".."), !parts.isEmpty else { throw SetupFailure(message: "Unsafe archive path.") }
            let clean = parts.filter { $0 != "." }.joined(separator: "/")
            guard !clean.isEmpty else { throw SetupFailure(message: "Unsafe archive path.") }
            return clean
        }
        func safeTarget(_ name: String, _ target: String, symbolic: Bool) throws -> String {
            guard !target.hasPrefix("/"), !target.contains("\\"), !target.contains("\n"), !target.contains("\r") else { throw SetupFailure(message: "Unsafe archive link.") }
            var parts = symbolic ? Array(name.split(separator: "/").dropLast()).map(String.init) : []
            for part in target.split(separator: "/") {
                if part == ".." { guard !parts.isEmpty else { throw SetupFailure(message: "Archive link escapes its folder.") }; parts.removeLast() }
                else if part != "." { parts.append(String(part)) }
            }
            guard !parts.isEmpty else { throw SetupFailure(message: "Unsafe archive link.") }
            return parts.joined(separator: "/")
        }
        var seen = Set<String>(), links: [(String, String, String, Bool)] = []
        var total: Int64 = 0, count = 0
        var entry: Pointer?
        while true {
            let status = next(reader, &entry)
            if status == 1 { break }
            guard status == 0, let member = entry, let raw = pathname(member), let name = String(validatingUTF8: raw) else { throw SetupFailure(message: "Malformed archive member.") }
            let clean = try relative(name)
            count += 1
            guard count < 100_000, seen.insert(clean).inserted else { throw SetupFailure(message: "Duplicate or excessive archive members.") }
            let destination = root.appendingPathComponent(clean)
            let parent = destination.deletingLastPathComponent()
            try MacRuntime.mkdir(parent)
            if let target = symlink(member) {
                let text = String(cString: target)
                links.append((clean, text, try safeTarget(clean, text, symbolic: true), true)); continue
            }
            if let target = hardlink(member) {
                let text = String(cString: target)
                links.append((clean, text, try safeTarget(clean, text, symbolic: false), false)); continue
            }
            switch filetype(member) {
            case UInt32(S_IFDIR): try MacRuntime.mkdir(destination)
            case UInt32(S_IFREG):
                let length = size(member)
                total += max(0, length)
                guard length >= 0, length <= 2_000_000_000, total <= 6_000_000_000 else { throw SetupFailure(message: "Archive exceeds the setup size limit.") }
                let descriptor = open(destination.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(permission(member) & 0o755))
                guard descriptor >= 0 else { throw SetupFailure(message: "Archive path collides with another member.") }
                do {
                    var buffer = [UInt8](repeating: 0, count: 64 * 1024)
                    var written: Int64 = 0
                    while true {
                        let bytes = readData(reader, &buffer, buffer.count)
                        guard bytes >= 0 else { throw SetupFailure(message: "Archive data is incomplete.") }
                        if bytes == 0 { break }
                        written += Int64(bytes)
                        guard written <= length else { throw SetupFailure(message: "Archive member exceeds its declared size.") }
                        try buffer.withUnsafeBytes { raw in
                            var offset = 0
                            while offset < bytes {
                                let n = write(descriptor, raw.baseAddress!.advanced(by: offset), bytes - offset)
                                guard n > 0 else { throw SetupFailure(message: "Cannot write the extracted runtime.") }; offset += n
                            }
                        }
                    }
                    guard written == length else { throw SetupFailure(message: "Archive member was truncated.") }
                } catch { close(descriptor); throw error }
                close(descriptor)
            default: throw SetupFailure(message: "Unsupported archive member type.")
            }
        }
        for (name, original, normalized, symbolic) in links {
            let destination = root.appendingPathComponent(name), target = root.appendingPathComponent(normalized)
            try KitUpdatePlan.realDirectory(destination.deletingLastPathComponent())
            if symbolic {
                // Symlink chains are permitted only when every lexical hop stays
                // inside this owned archive tree. Check final resolution below.
                guard Darwin.symlink(original, destination.path) == 0 else { throw SetupFailure(message: "Archive link collides with a file.") }
            } else {
                _ = try KitUpdatePlan.regular(target)
                guard Darwin.link(target.path, destination.path) == 0 else { throw SetupFailure(message: "Invalid archive hard link.") }
            }
        }
        // Canonicalize both sides with the same filesystem primitive. Foundation
        // can spell a resolved /private/var target as /var on macOS; comparing it
        // with an unresolved root incorrectly rejects contained vendor links.
        guard let rootPath = realpath(root.path,nil) else { throw SetupFailure(message:"The archive extraction folder changed.") }
        let canonicalRoot = String(cString:rootPath); Darwin.free(rootPath)
        for (name, _, _, symbolic) in links where symbolic {
            let link = root.appendingPathComponent(name)
            guard let targetPath = realpath(link.path,nil) else { throw SetupFailure(message:"Archive contains a broken link: \(name).") }
            let resolved = String(cString:targetPath); Darwin.free(targetPath)
            guard resolved.hasPrefix(canonicalRoot + "/"), MacRuntime.fm.fileExists(atPath:resolved) else { throw SetupFailure(message:"Archive contains an escaping link: \(name).") }
        }
    }
}
