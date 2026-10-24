import AppKit
import Foundation
import Darwin

#if ZERO_SETUP_TESTS
private func snapshot(_ overrides: [String: Int] = [:]) -> String {
    var values = ["kit": 1, "code": 1, "java": 1, "node": 1, "profile": 1, "zero": 1, "redhat": 1, "javaHomeBlocked": 0]
    values.merge(overrides) { _, new in new }
    values["ready"] = ["kit", "code", "java", "node", "profile", "zero", "redhat"].allSatisfy { values[$0] == 1 } ? 1 : 0
    return "ZERO_SETUP_V1\n" + values.keys.sorted().map { "\($0)=\(values[$0]!)" }.joined(separator: "\n") + "\nEND_ZERO_SETUP\n"
}
private final class FakeRunner: SetupCommandRunning {
    var progress: ((String) -> Void)?
    var commands: [SetupCommand] = []
    var timeouts: [TimeInterval] = []
    var paused = false
    var delay: TimeInterval = 0
    var pending: ((CommandResult) -> Void)?
    var result = CommandResult(exitCode: 0, output: snapshot(), timedOut: false, launchError: nil)
    var checkOutput = snapshot()
    var plan = "manual"
    var useDynamic = false
    var onRun: ((SetupCommand) -> Void)?
    func run(_ command: SetupCommand, timeout: TimeInterval, completion: @escaping (CommandResult) -> Void) {
        commands.append(command); timeouts.append(timeout); onRun?(command)
        if paused { pending = completion } else if delay > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { completion(self.response(command)) }
        } else { completion(response(command)) }
    }
    private func response(_ command: SetupCommand) -> CommandResult {
        guard useDynamic else { return result }
        let output = command.arguments.contains("--native-check") ? checkOutput : command.arguments.contains("--native-plan") ? "ZERO_PLAN_V1\naction=\(plan)\nEND_ZERO_PLAN\n" : "Fake approved action finished."
        return CommandResult(exitCode: 0, output: output, timedOut: false, launchError: nil)
    }
    func finish() { let completion = pending; pending = nil; completion?(result) }
}

private final class FakeUpdatePreferences: UpdatePreferences {
    let defaults: UserDefaults
    var writes = 0
    init(defaults: UserDefaults) { self.defaults = defaults }
    var automaticallyChecksForUpdates: Bool {
        get { defaults.object(forKey: "checks") as? Bool ?? true }
        set { writes += 1; defaults.set(newValue, forKey: "checks") }
    }
    var automaticallyDownloadsUpdates: Bool {
        get { defaults.object(forKey: "downloads") as? Bool ?? true }
        set { writes += 1; defaults.set(newValue, forKey: "downloads") }
    }
    var allowsAutomaticUpdates: Bool { automaticallyChecksForUpdates }
}

@main
struct SetupTests {
    static let manager = FileManager.default
    static var passed = 0
    static func expect(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
        guard try condition() else { throw SetupFailure(message: "FAIL: \(message)") }
        passed += 1
    }
    static func rejected(_ message: String, _ body: () throws -> Void) throws {
        do { try body() } catch { passed += 1; return }
        throw SetupFailure(message: "FAIL: expected rejection: \(message)")
    }
    static func pump(until condition: () -> Bool, seconds: TimeInterval = 5) throws {
        let deadline = Date().addingTimeInterval(seconds)
        while !condition() && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
        try expect(condition(), "asynchronous completion")
    }
    static func fixture(_ root: URL) throws -> SetupKit {
        let members = ["START-HERE.md", "setup/setup.sh", "setup/Setup.command", "setup/kit.properties", "zero-1.2.3.vsix",
                       "setup/Setup.cmd", "setup/Setup.ps1", "setup/mac-downloads.json", "setup/README.md", "LICENSE",
                       "starter/zero.json", "starter/pom.xml", "starter/mvnw", "starter/mvnw.cmd",
                       "starter/.mvn/wrapper/maven-wrapper.properties", "starter/.vscode/tasks.json", "optional/Zero.code-profile"]
        for member in members {
            let url = root.appendingPathComponent(member)
            try manager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            let text = member == "setup/kit.properties" ? "kitVersion=1.2.3\n" : "fixture \(member)\n"
            try text.write(to: url, atomically: true, encoding: .utf8)
        }
        for member in ["setup/setup.sh", "setup/Setup.command", "starter/mvnw"] {
            try manager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: root.appendingPathComponent(member).path)
        }
        return SetupKit(root: root)
    }

    static func updaterTests(app: NSApplication, kit: SetupKit, home: URL) throws {
        for request in [NativeUpdateRequest.check, .settings] {
            try expect(NativeUpdateRequest(url: URL(string: request.rawValue)!) == request, "fixed update request accepted")
        }
        for value in ["zero-updates://check/", "zero-updates://check?feed=https://evil.example", "zero-updates://check#x", "zero-updates://settings/path", "zero-updates://user@check", "zero-updates://check:1", "zero-updates://CHECK", "zero-updates://%63heck", "https://check", "zero-updates://other"] {
            try expect(NativeUpdateRequest(url: URL(string: value)!) == nil, "request cannot carry unreviewed inputs: \(value)")
        }
        var info: [String: Any] = ["CFBundleIdentifier": "ca.codepet.zero", "ZeroDevelopmentBuild": false, "SUFeedURL": "https://zero.codepet.ca/updates/macos/appcast.xml", "SUPublicEDKey": Data(repeating: 1, count: 32).base64EncodedString()]
        try expect(UpdateConfiguration(info: info).eligible, "production updater configuration eligible")
        info["ZeroDevelopmentBuild"] = true
        try expect(!UpdateConfiguration(info: info).eligible, "development app cannot start updater")
        info["ZeroDevelopmentBuild"] = false; info["CFBundleIdentifier"] = "ca.codepet.zero.update-test"
        try expect(!UpdateConfiguration(info: info).eligible, "normal compilation rejects fixture identity")
        info["CFBundleIdentifier"] = "ca.codepet.zero"; info["SUFeedURL"] = "https://evil.example/feed"
        try expect(!UpdateConfiguration(info: info).eligible, "production feed cannot be redirected by request configuration")
        info["SUFeedURL"] = "https://zero.codepet.ca/updates/macos/appcast.xml"; info["SUPublicEDKey"] = "invalid"
        try expect(!UpdateConfiguration(info: info).eligible, "missing or invalid update key disables updater")
        let now = Date(timeIntervalSince1970: 100000)
        try expect(!UpdateLifecycle.checkIsDue(enabled: false, lastCheck: nil, interval: 86400, now: now), "disabled auto checks never forced")
        try expect(UpdateLifecycle.checkIsDue(enabled: true, lastCheck: nil, interval: 86400, now: now), "first enabled launch checks")
        try expect(!UpdateLifecycle.checkIsDue(enabled: true, lastCheck: now.addingTimeInterval(-86399), interval: 86400, now: now), "daily check not forced early")
        try expect(UpdateLifecycle.checkIsDue(enabled: true, lastCheck: now.addingTimeInterval(-86400), interval: 86400, now: now), "daily due boundary")
        var policy = UpdateLifecycle(); policy.handedOff(now: 10)
        try expect(!policy.shouldTerminate(now: 129.9, helperActive: false) && policy.shouldTerminate(now: 130, helperActive: false), "unattended budget expires after 120 seconds")
        policy.handedOff(now: 100)
        try expect(policy.deadline == 130, "reopens do not extend unattended work budget")
        try expect(!policy.shouldTerminate(now: 200, helperActive: true), "deadline protects active setup helper")
        policy.launching = true
        try expect(!policy.shouldTerminate(now: 200, helperActive: false), "reopen launch protects setup before helper begins")
        policy.launching = false; policy.updateUI = true
        try expect(!policy.shouldTerminate(now: 200, helperActive: false), "deadline preserves visible update offer")
        policy.updateUI = false; policy.modalUI = true
        try expect(!policy.shouldTerminate(now: 200, helperActive: false), "deadline preserves modal authorization or result")
        policy.modalUI = false; policy.installationCommitted = true; policy.cycleFinished = true
        try expect(!policy.shouldTerminate(now: 200, helperActive: false) && !policy.mayBeginSetup, "cycle completion cannot interrupt committed installation or start new setup")
        policy.installationCommitted = false; policy.installOnQuit = true
        try expect(policy.shouldTerminate(now: 20, helperActive: false), "verified install-on-quit exits promptly")
        try expect(!policy.commitTermination(helperActive: true) && policy.mayBeginSetup, "helper blocks atomic termination commit")
        try expect(policy.commitTermination(helperActive: false) && !policy.mayBeginSetup, "termination commit prevents all later setup")
        var manual = UpdateLifecycle(); manual.manualCheck = true; manual.updateUI = true; manual.cycleFinished = true
        try expect(!manual.shouldTerminate(now: 100000, helperActive: false), "manual no-update result survives until dismissal")
        var prepared = manual; prepared.installationCommitted = true
        var continuation = UpdateRelaunchContinuation(); var resumed = 0
        try expect(continuation.postpone(until: { resumed += 1 }, lifecycle: prepared, helperActive: true), "manual relaunch waits for active helper")
        try expect(!prepared.mayBeginSetup && !prepared.mayContinueSetup, "prepared installation freezes new setup")
        try expect(!prepared.shouldTerminate(now: 100000, helperActive: false), "manual relaunch never uses normal idle termination")
        try expect(continuation.takeIfReady(lifecycle: prepared, helperActive: true) == nil, "helper blocks continuation")
        prepared.launching = true
        try expect(prepared.mayContinueSetup && !prepared.mayBeginSetup, "existing launch can finish while new launches stay blocked")
        try expect(continuation.takeIfReady(lifecycle: prepared, helperActive: false) == nil, "launch transition blocks continuation")
        prepared.launching = false; prepared.modalUI = true
        try expect(continuation.takeIfReady(lifecycle: prepared, helperActive: false) == nil, "modal authorization blocks continuation")
        prepared.modalUI = false
        continuation.takeIfReady(lifecycle: prepared, helperActive: false)?()
        continuation.takeIfReady(lifecycle: prepared, helperActive: false)?()
        try expect(resumed == 1, "idle resumes Sparkle continuation exactly once")
        try expect(!continuation.postpone(until: { resumed += 1 }, lifecycle: prepared, helperActive: false), "idle installation proceeds directly through Sparkle")
        try expect(continuation.takeIfReady(lifecycle: prepared, helperActive: false) == nil && resumed == 1, "direct path does not retain or invoke handler")
        try expect(continuation.postpone(until: { resumed += 1 }, lifecycle: prepared, helperActive: true), "another prepared continuation can wait")
        continuation.cancel()
        try expect(continuation.takeIfReady(lifecycle: prepared, helperActive: false) == nil && resumed == 1, "failed cycle discards continuation")
        manual.updateUI = false
        try expect(manual.shouldTerminate(now: 100000, helperActive: false), "manual result dismissal permits exit")
        var settings = UpdateLifecycle(); settings.settingsVisible = true; settings.cycleFinished = true
        try expect(!settings.shouldTerminate(now: 100000, helperActive: false), "settings remains open without setup")
        settings.settingsVisible = false
        try expect(settings.shouldTerminate(now: 100000, helperActive: false), "settings closure ends idle explicit session")
        let suite = "ca.codepet.zero.updater-tests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let preferences = FakeUpdatePreferences(defaults: defaults)
        preferences.automaticallyChecksForUpdates = false; preferences.automaticallyDownloadsUpdates = false
        let writes = preferences.writes
        let settingsWindow = UpdateSettingsWindow(preferences: preferences)
        try expect(preferences.writes == writes, "opening settings never overwrites persisted user choice")
        let stack = settingsWindow.window!.contentView!.subviews.compactMap { $0 as? NSStackView }.first!
        let boxes = stack.arrangedSubviews.compactMap { $0 as? NSButton }
        try expect(boxes.count == 2 && boxes[0].state == .off && boxes[1].state == .off && !boxes[1].isEnabled, "settings reflects both saved updater preferences")
        boxes[0].performClick(nil); boxes[1].performClick(nil)
        let reloaded = FakeUpdatePreferences(defaults: defaults)
        try expect(reloaded.automaticallyChecksForUpdates && reloaded.automaticallyDownloadsUpdates, "checkbox changes persist through updater preference adapter")
        settingsWindow.close()
        let blockedRunner = FakeRunner(); let blocked = SetupController(kit: kit, runner: blockedRunner, home: home)
        blocked.mayBeginWork = { false }
        blocked.launch(); blocked.check(); blocked.primaryAction(); blocked.place(parent: home, name: "Must not exist")
        try expect(blockedRunner.commands.isEmpty && !blocked.busy && !manager.fileExists(atPath: home.appendingPathComponent("Must not exist").path), "committed updater blocks every public setup entry")
        for early in [true, false] {
            let delegate = SetupApplication(arguments: ["Zero", "--update-request"])
            var launches = 0; var requests: [NativeUpdateRequest] = []
            delegate.launchForTesting = { launches += 1 }; delegate.handleRequestForTesting = { requests.append($0) }
            if early { delegate.application(app, open: [URL(string: NativeUpdateRequest.settings.rawValue)!]) }
            delegate.applicationDidFinishLaunching(Notification(name: NSApplication.didFinishLaunchingNotification))
            var launchCallbackDrained = false
            DispatchQueue.main.async { launchCallbackDrained = true }
            try pump(until: { launchCallbackDrained })
            if !early { delegate.application(app, open: [URL(string: NativeUpdateRequest.settings.rawValue)!]) }
            try expect(launches == 0 && requests == [.settings], "cold URL skips setup regardless of AppleEvent ordering")
            delegate.application(app, open: [URL(string: NativeUpdateRequest.check.rawValue)!])
            try expect(launches == 0 && requests == [.settings, .check], "running process accepts explicit request without setup")
            delegate.application(app, open: [URL(string: "zero-updates://check?feed=evil")!])
            delegate.application(app, open: [URL(string: NativeUpdateRequest.check.rawValue)!, URL(string: NativeUpdateRequest.settings.rawValue)!])
            try expect(requests == [.settings, .check], "malformed and mixed running events have no effects")
        }
    }

    static func main() throws {
        if let option = CommandLine.arguments.firstIndex(of: "--nested-timeout-helper"), option + 1 < CommandLine.arguments.count {
            _ = try MacRuntime.execute("/bin/bash", ["-c", "sleep 30 & child=$!; echo \"$child\" > \"$1\"; wait", "fake-helper", CommandLine.arguments[option + 1]])
            return
        }
        if let option = CommandLine.arguments.firstIndex(of: "--detached-pipe-child"), option + 1 < CommandLine.arguments.count {
            guard setsid() >= 0 else { exit(2) }
            try String(getpid()).write(toFile: CommandLine.arguments[option + 1], atomically: true, encoding: .utf8)
            sleep(30)
            return
        }
        if let option = CommandLine.arguments.firstIndex(of: "--detached-pipe-helper"), option + 1 < CommandLine.arguments.count {
            let executable = URL(fileURLWithPath: CommandLine.arguments[0]).path
            let pidFile = CommandLine.arguments[option + 1]
            let arguments = [executable, "--detached-pipe-child", pidFile].map { strdup($0) } + [nil]
            let environment = ProcessInfo.processInfo.environment.map { strdup("\($0.key)=\($0.value)") } + [nil]
            defer { arguments.forEach { free($0) }; environment.forEach { free($0) } }
            var child: pid_t = 0
            let launched = arguments.withUnsafeBufferPointer { argv in
                environment.withUnsafeBufferPointer { env in
                    posix_spawn(&child, executable, nil, nil, UnsafeMutablePointer(mutating: argv.baseAddress!), UnsafeMutablePointer(mutating: env.baseAddress!))
                }
            }
            guard launched == 0 else { exit(2) }
            let deadline = ProcessInfo.processInfo.systemUptime + 2
            while !manager.fileExists(atPath: pidFile) && ProcessInfo.processInfo.systemUptime < deadline { usleep(10_000) }
            guard manager.fileExists(atPath: pidFile) else { kill(child, SIGKILL); exit(2) }
            print("parent exited; detached child holds pipe")
            return
        }
        let temporaryBase = manager.temporaryDirectory.resolvingSymlinksInPath()
        let realTemporary = temporaryBase.path.hasPrefix("/var/") ? URL(fileURLWithPath: "/private" + temporaryBase.path) : temporaryBase
        let temporary = realTemporary.appendingPathComponent("Zero native tests \(UUID().uuidString)")
        try manager.createDirectory(at: temporary, withIntermediateDirectories: true)
        defer { try? manager.removeItem(at: temporary) }
        let kit = try fixture(temporary.appendingPathComponent("bundled kit $x; 'quotes'"))
        try kit.validate()
        let parent = temporary.appendingPathComponent("student files $x; 'quotes'")
        try manager.createDirectory(at: parent, withIntermediateDirectories: true)
        if CommandLine.arguments.contains("--interactive-preview") {
            let scenarioIndex = CommandLine.arguments.firstIndex(of: "--scenario")
            let scenario = scenarioIndex.flatMap { $0 + 1 < CommandLine.arguments.count ? CommandLine.arguments[$0 + 1] : nil } ?? "profile"
            let fake = FakeRunner(); fake.useDynamic = true; fake.delay = 5
            switch scenario {
            case "tools": fake.plan = "manual"; fake.checkOutput = snapshot(["code": 0, "profile": 0, "zero": 0, "redhat": 0])
            case "profile", "profile-unfinished": fake.checkOutput = snapshot(["profile": 0, "zero": 0, "redhat": 0])
            case "extensions": fake.checkOutput = snapshot(["zero": 0, "redhat": 0])
            case "failure": fake.useDynamic = false; fake.result = CommandResult(exitCode: 42, output: "Fake network failure. No host changes.", timedOut: false, launchError: nil)
            default: fake.checkOutput = snapshot()
            }
            fake.onRun = { command in
                if scenario == "progress" {
                    fake.delay = command.arguments.contains("--native-install") ? 60 : 5
                    if command.arguments.contains("--native-install") {
                        for (index, token) in ["java", "editor", "settings", "zero", "redhat", "verify"].enumerated() {
                            DispatchQueue.main.asyncAfter(deadline: .now() + Double(index + 1) * 8) {
                                fake.progress?(token)
                                print("Safe fake progress: \(token)")
                            }
                        }
                    }
                }
                if command.executable == "/usr/bin/open" { fake.checkOutput = snapshot(["profile": 0, "zero": 0, "redhat": 0]) }
                if command.arguments.contains("--native-profile") && scenario != "profile-unfinished" { fake.checkOutput = snapshot(["zero": 0, "redhat": 0]) }
                if command.arguments.contains("--native-install") { fake.checkOutput = snapshot() }
            }
            let app = NSApplication.shared; app.setActivationPolicy(.regular)
            let controller = SetupController(kit: kit, runner: fake, home: parent)
            let window = SetupWindow(controller: controller)
            let delegate = SetupApplication(); delegate.setupWindow = window
            // No production launch delegate is installed: this harness exclusively
            // owns disposable fixtures and fake commands, including approvals.
            window.window?.title = "Zero — safe fake preview"
            window.showWindow(nil); app.activate(ignoringOtherApps: true)
            if scenario == "resume" {
                _ = try kit.place(parent: parent, name: "Zero")
                controller.launch()
            } else if scenario == "launch" {
                controller.launch()
            } else if scenario == "update" {
                let existing = try kit.place(parent: parent, name: "Zero")
                try "student code".write(to: existing.appendingPathComponent("starter/Main.java"), atomically: true, encoding: .utf8)
                try "student save".write(to: existing.appendingPathComponent("starter/save.dat"), atomically: true, encoding: .utf8)
                try "old setup".write(to: existing.appendingPathComponent("setup/README.md"), atomically: true, encoding: .utf8)
                controller.check()
            } else if scenario == "folder" || scenario == "progress" { controller.check() }
            else { controller.place(parent: parent, name: "Preview kit") }
            print("Safe interactive preview scenario: \(scenario). All commands fake; folder \(temporary.path)")
            app.run()
            return
        }
        let fresh = try kit.place(parent: parent, name: "My Zero $x; 'quoted'")
        try expect(try manager.contentsOfDirectory(atPath: fresh.path).count == manager.contentsOfDirectory(atPath: kit.root.path).count, "complete kit copied")
        try expect(manager.isExecutableFile(atPath: fresh.appendingPathComponent("starter/mvnw").path), "Maven wrapper executable mode preserved")
        try expect(manager.isExecutableFile(atPath: fresh.appendingPathComponent("setup/Setup.command").path), "launcher executable mode preserved")
        let marker = fresh.appendingPathComponent("student-owned.txt")
        try "preserve me".write(to: marker, atomically: true, encoding: .utf8)
        try rejected("existing project") { _ = try kit.place(parent: parent, name: fresh.lastPathComponent) }
        try expect(try String(contentsOf: marker, encoding: .utf8) == "preserve me", "existing student data retained")
        let existingFile = parent.appendingPathComponent("existing-file")
        try "keep".write(to: existingFile, atomically: true, encoding: .utf8)
        try rejected("existing file") { _ = try kit.place(parent: parent, name: "existing-file") }
        let dangling = parent.appendingPathComponent("dangling")
        try manager.createSymbolicLink(at: dangling, withDestinationURL: parent.appendingPathComponent("absent"))
        try rejected("dangling destination") { _ = try kit.place(parent: parent, name: "dangling") }
        try rejected("destination race") {
            _ = try kit.place(parent: parent, name: "raced") {
                try manager.createDirectory(at: parent.appendingPathComponent("raced"), withIntermediateDirectories: false)
                try "race owner".write(to: parent.appendingPathComponent("raced/marker"), atomically: true, encoding: .utf8)
            }
        }
        try expect(try String(contentsOf: parent.appendingPathComponent("raced/marker"), encoding: .utf8) == "race owner", "race destination retained")
        try expect(try !manager.contentsOfDirectory(atPath: parent.path).contains { $0.hasPrefix(".zero-setup-") }, "owned staging cleaned")
        for name in ["", ".", "..", "a/b", "bad:name", " a", "a\n", String(repeating: "a", count: 201)] {
            try rejected("invalid folder name \(name.debugDescription)") { _ = try kit.place(parent: parent, name: name) }
        }
        try rejected("missing parent") { _ = try kit.place(parent: temporary.appendingPathComponent("absent"), name: "Zero") }
        try rejected("file parent") { _ = try kit.place(parent: existingFile, name: "Zero") }
        let parentLink = temporary.appendingPathComponent("parent link")
        try manager.createSymbolicLink(at: parentLink, withDestinationURL: parent)
        try rejected("symlink parent") { _ = try kit.place(parent: parentLink, name: "Zero") }
        let sourceLink = kit.root.appendingPathComponent("external link")
        try manager.createSymbolicLink(at: sourceLink, withDestinationURL: existingFile)
        try rejected("symlink in kit") { try kit.validate() }
        try manager.removeItem(at: sourceLink)

        let defaultHome = temporary.appendingPathComponent("default home")
        try manager.createDirectory(at: defaultHome, withIntermediateDirectories: false)
        let location = DefaultSetupLocation(home: defaultHome)
        try expect(try location.destination().lastPathComponent == "Zero", "empty home defaults to Zero")
        try expect(try manager.contentsOfDirectory(atPath: defaultHome.path).isEmpty, "default inspection creates nothing")
        try rejected("missing default home") { _ = try DefaultSetupLocation(home: temporary.appendingPathComponent("missing home")).destination() }
        try rejected("file default home") { _ = try DefaultSetupLocation(home: existingFile).destination() }
        try rejected("symlink default home") { _ = try DefaultSetupLocation(home: parentLink).destination() }
        try rejected("lstat root error") { _ = try DefaultSetupLocation(home: existingFile.appendingPathComponent("not-a-directory")).destination() }
        let deniedHome = temporary.appendingPathComponent("denied home")
        try manager.createDirectory(at: deniedHome, withIntermediateDirectories: false)
        try manager.setAttributes([.posixPermissions: 0o500], ofItemAtPath: deniedHome.path)
        try rejected("unwritable default home") { _ = try DefaultSetupLocation(home: deniedHome).destination() }
        try manager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: deniedHome.path)
        let emptyController = SetupController(kit: kit, runner: FakeRunner(), home: deniedHome)
        emptyController.check()
        try expect(emptyController.summary == "Preparing your Zero folder…", "check automatically starts fixed-folder preparation")
        try expect(emptyController.busy && !emptyController.mayExit(), "fresh placement gates shutdown")
        try pump(until: { !emptyController.busy })
        try expect(emptyController.stage == .opened && emptyController.selectedFolder?.lastPathComponent == "Zero", "launch creates fixed Zero and rechecks without another action")
        try rejected("fresh default race never auto updates") {
            _ = try kit.place(parent: defaultHome, name: "Zero") {
                _ = try fixture(defaultHome.appendingPathComponent("Zero"))
                try "race owner".write(to: defaultHome.appendingPathComponent("Zero/starter/Main.java"), atomically: true, encoding: .utf8)
            }
        }
        try expect(try String(contentsOf: defaultHome.appendingPathComponent("Zero/starter/Main.java"), encoding: .utf8) == "race owner", "raced kit preserved until a deliberate retry")
        let existing = defaultHome.appendingPathComponent("Zero")
        let preserved = ["starter/Main.java", "starter/pom.xml", "starter/.vscode/tasks.json", "starter/.git/config", "starter/assets/art.png", "starter/saves/game.dat", "starter/src/main/java/zero/App.java", "optional/Zero.code-profile", "optional/keybindings.json", "teacher-notes.txt", "zero-0.9.0.vsix"]
        for name in preserved {
            let file = existing.appendingPathComponent(name)
            try manager.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try "student \(name)".write(to: file, atomically: true, encoding: .utf8)
        }
        let studentLink = existing.appendingPathComponent("starter/assets/student-link")
        try manager.createSymbolicLink(at: studentLink, withDestinationURL: existingFile)
        try "old launcher".write(to: existing.appendingPathComponent("setup/README.md"), atomically: true, encoding: .utf8)
        let defaultFake = FakeRunner()
        let defaultController = SetupController(kit: kit, runner: defaultFake, home: defaultHome)
        defaultController.check()
        try expect(defaultController.summary == "Preparing Zero…", "recognized kit automatically starts setup-only update")
        try expect(defaultFake.commands.count == 1 && defaultFake.commands[0].arguments[1] == kit.root.path, "no existing launcher executed before upgrade")
        try expect(defaultController.busy && !defaultController.mayExit(), "update gates close")
        try pump(until: { !defaultController.busy })
        try expect(defaultController.stage == .opened && defaultController.selectedFolder == existing, "automatic update rechecks fixed kit")
        try expect(defaultFake.commands.last?.arguments.last == "--native-resume", "recognized kit refresh resumes saved editor session")
        try expect(defaultController.diagnostics.contains("Previous setup backup:"), "diagnostics record permanent backup location")
        try expect(try String(contentsOf: existing.appendingPathComponent("setup/README.md"), encoding: .utf8) == "fixture setup/README.md\n", "old setup refreshed from bundle")
        for name in preserved {
            try expect(try String(contentsOf: existing.appendingPathComponent(name), encoding: .utf8) == "student \(name)", "student file preserved: \(name)")
        }
        try expect(try manager.destinationOfSymbolicLink(atPath: studentLink.path) == existingFile.path, "unrelated student symlink preserved")
        let backupNames = try manager.contentsOfDirectory(atPath: defaultHome.path).filter { $0.hasPrefix(".zero-setup-backup-") }
        try expect(backupNames.count == 1, "one retained backup after update")
        try expect(try String(contentsOf: defaultHome.appendingPathComponent(backupNames[0] + "/previous/setup_README.md"), encoding: .utf8) == "old launcher", "backup retains replaced launcher")
        let repeatPlan = try KitUpdatePlan(kit: kit, destination: existing)
        _ = try repeatPlan.update(from: kit)
        try expect(try String(contentsOf: existing.appendingPathComponent("starter/saves/game.dat"), encoding: .utf8) == "student starter/saves/game.dat", "repeat update preserves saves")
        let lockedPlan = try KitUpdatePlan(kit: kit, destination: existing)
        let lockFD = open(existing.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        try expect(lockFD >= 0 && flock(lockFD, LOCK_EX | LOCK_NB) == 0, "fixture acquires update lock")
        try rejected("concurrent update serialized") { _ = try lockedPlan.update(from: kit) }
        flock(lockFD, LOCK_UN); close(lockFD)
        let nextKit = try fixture(temporary.appendingPathComponent("new version bundle"))
        try "kitVersion=1.2.4\n".write(to: nextKit.root.appendingPathComponent("setup/kit.properties"), atomically: true, encoding: .utf8)
        try manager.moveItem(at: nextKit.root.appendingPathComponent("zero-1.2.3.vsix"), to: nextKit.root.appendingPathComponent("zero-1.2.4.vsix"))
        _ = try KitUpdatePlan(kit: nextKit, destination: existing).update(from: nextKit)
        try expect(try String(contentsOf: existing.appendingPathComponent("setup/kit.properties"), encoding: .utf8) == "kitVersion=1.2.4\n", "new version metadata published")
        try expect(manager.fileExists(atPath: existing.appendingPathComponent("zero-1.2.4.vsix").path) && manager.fileExists(atPath: existing.appendingPathComponent("zero-1.2.3.vsix").path), "current extension added and old extension kept")
        let metadataBefore = try Data(contentsOf: existing.appendingPathComponent("setup/kit.properties"))
        try rejected("failure after metadata rollback") {
            _ = try KitUpdatePlan(kit: kit, destination: existing).update(from: kit, afterReplace: { name in
                if name == "setup/kit.properties" { throw SetupFailure(message: "metadata failure") }
            })
        }
        try expect(try Data(contentsOf: existing.appendingPathComponent("setup/kit.properties")) == metadataBefore, "metadata restored on failure")
        let setupDirectory = existing.appendingPathComponent("setup")
        let renamedSetup = existing.appendingPathComponent("previous-setup")
        try manager.moveItem(at: setupDirectory, to: renamedSetup)
        try manager.createSymbolicLink(at: setupDirectory, withDestinationURL: renamedSetup)
        try rejected("touched ancestor symlink refused") { _ = try KitUpdatePlan(kit: kit, destination: existing) }
        try manager.removeItem(at: setupDirectory); try manager.moveItem(at: renamedSetup, to: setupDirectory)
        try "kitVersion=not-a-version\n".write(to: existing.appendingPathComponent("setup/kit.properties"), atomically: true, encoding: .utf8)
        try rejected("invalid installed metadata refused") { _ = try KitUpdatePlan(kit: kit, destination: existing) }
        try metadataBefore.write(to: existing.appendingPathComponent("setup/kit.properties"))
        let racePlan = try KitUpdatePlan(kit: kit, destination: existing)
        try rejected("changed target after confirmation") {
            _ = try racePlan.update(from: kit, beforeCommit: {
                try "external change".write(to: existing.appendingPathComponent("setup/README.md"), atomically: true, encoding: .utf8)
            })
        }
        try expect(try String(contentsOf: existing.appendingPathComponent("setup/README.md"), encoding: .utf8) == "external change", "external edit before commit preserved")
        let failurePlan = try KitUpdatePlan(kit: kit, destination: existing)
        try rejected("mid update failure") {
            _ = try failurePlan.update(from: kit, afterReplace: { name in
                if name == "setup/README.md" { throw SetupFailure(message: "injected failure") }
            })
        }
        try expect(try String(contentsOf: existing.appendingPathComponent("setup/README.md"), encoding: .utf8) == "external change", "failure restores exact old setup file")
        _ = try KitUpdatePlan(kit: kit, destination: existing).update(from: kit)
        try expect(try String(contentsOf: existing.appendingPathComponent("setup/README.md"), encoding: .utf8) == "fixture setup/README.md\n", "retry succeeds after rollback")
        let rootRacePlan = try KitUpdatePlan(kit: kit, destination: existing)
        let moved = defaultHome.appendingPathComponent("moved Zero")
        try rejected("root identity raced") {
            _ = try rootRacePlan.update(from: kit, beforeCommit: {
                try manager.moveItem(at: existing, to: moved)
                try manager.createSymbolicLink(at: existing, withDestinationURL: moved)
            })
        }
        try expect(try String(contentsOf: moved.appendingPathComponent("starter/saves/game.dat"), encoding: .utf8) == "student starter/saves/game.dat", "root race preserves student work")
        try manager.removeItem(at: existing); try manager.moveItem(at: moved, to: existing)
        let badHome = temporary.appendingPathComponent("unrelated home")
        try manager.createDirectory(at: badHome, withIntermediateDirectories: false)
        for kind in ["folder", "file", "link"] {
            let target = badHome.appendingPathComponent("Zero")
            if kind == "folder" { try manager.createDirectory(at: target, withIntermediateDirectories: false) }
            if kind == "file" { try "owned".write(to: target, atomically: true, encoding: .utf8) }
            if kind == "link" { try manager.createSymbolicLink(at: target, withDestinationURL: existing) }
            let refused = SetupController(kit: kit, runner: FakeRunner(), home: badHome)
            refused.check()
            try expect(refused.stage == .retry && refused.selectedFolder == nil && !refused.busy, "refuse unrelated \(kind)")
            try expect(try manager.contentsOfDirectory(atPath: badHome.path) == ["Zero"], "refusal writes nothing")
            try manager.removeItem(at: target)
        }
        let unavailable = SetupController(kit: kit, runner: FakeRunner(), home: parentLink)
        unavailable.check()
        try expect(unavailable.stage == .retry && unavailable.summary.contains("Details"), "unavailable default offers error details and retry")
        unavailable.primaryAction()
        try expect(!unavailable.busy && unavailable.selectedFolder == nil, "failed default never claims success or starts copying")
        try manager.removeItem(at: parentLink)
        try manager.createDirectory(at: parentLink, withIntermediateDirectories: false)
        unavailable.primaryAction()
        try pump(until: { !unavailable.busy })
        try expect(unavailable.stage == .opened && unavailable.selectedFolder?.lastPathComponent == "Zero", "retry uses default after home is repaired")
        let fake = FakeRunner()
        let controller = SetupController(kit: kit, runner: fake, home: parent)
        try expect(fake.commands.isEmpty, "controller waits for launch-triggered check")
        controller.place(parent: nil, name: nil)
        try expect(fake.commands.isEmpty && controller.selectedFolder == nil && !controller.busy, "cancelled selection executes nothing")
        controller.primaryAction()
        try expect(fake.commands.isEmpty, "initial action cannot launch editor")
        controller.check()
        try expect(fake.commands == [SetupCommand(executable: Bundle.main.executableURL!.path, arguments: ["--runtime", kit.root.path, "--native-check"])], "check uses fixed argv")
        try expect(fake.timeouts == [180] && controller.busy, "read-only check leads directly to folder preparation")
        try pump(until: { !controller.busy })
        try expect(controller.stage == .opened && controller.selectedFolder == parent.appendingPathComponent("Zero"), "automatic install opens editor after verified readiness")
        try expect(fake.commands.filter { $0.arguments.contains("--native-open") }.count == 1, "launch preparation opens editor exactly once")
        fake.result = CommandResult(exitCode: 0, output: "partial response", timedOut: false, launchError: nil)
        controller.check()
        try expect(controller.stage == .retry, "zero exit without complete response cannot ready")
        fake.result = CommandResult(exitCode: 0, output: snapshot(), timedOut: true, launchError: nil)
        controller.check()
        try expect(controller.stage == .retry && controller.summary.contains("timed out"), "timeout overrides exit zero")
        fake.result = CommandResult(exitCode: nil, output: "", timedOut: false, launchError: "denied")
        controller.check()
        try expect(controller.stage == .retry && controller.diagnostics.contains("denied"), "spawn failure details separated")
        fake.result = CommandResult(exitCode: 0, output: snapshot(), timedOut: false, launchError: nil)
        controller.primaryAction()
        try pump(until: { !controller.busy })
        try expect(controller.selectedFolder != nil && controller.stage == .opened, "placed complete kit ready only after recheck")
        try expect(fake.commands.contains { $0.arguments.contains("--native-install") && $0.arguments.last == "--approved" }, "launch prepares scoped configuration automatically")
        controller.primaryAction()
        try expect(fake.commands.last?.arguments.last == "--native-open" && controller.stage == .opened, "explicit repeat action opens Zero again")
        let copied = controller.selectedFolder!
        let openedBeforeRecheck = fake.commands.filter { $0.arguments.contains("--native-open") }.count
        controller.check()
        try expect(fake.commands.filter { $0.arguments.contains("--native-open") }.count == openedBeforeRecheck, "later readiness checks never automatically reopen Zero")
        try expect(fake.commands.last == SetupCommand(executable: Bundle.main.executableURL!.path, arguments: ["--runtime", copied.path, "--native-check"]), "recheck probes copied kit")
        for member in ["starter/pom.xml", "starter/mvnw"] {
            let file = copied.appendingPathComponent(member), saved = try Data(contentsOf: file)
            try manager.removeItem(at: file)
            let count = fake.commands.count
            controller.check()
            try expect(fake.commands.count == count && controller.stage == .retry && controller.diagnostics.contains(member), "broken copied member never ready")
            try saved.write(to: file)
            if member == "starter/mvnw" { try manager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: file.path) }
        }
        fake.useDynamic = true
        fake.checkOutput = snapshot(["code": 0, "java": 0, "profile": 0, "zero": 0, "redhat": 0])
        controller.check()
        try expect(controller.stage == .retry, "missing tools offer setup retry without vendor or profile steps")
        let before = fake.commands.count
        fake.onRun = { command in
            if command.arguments.contains("--native-install") { fake.checkOutput = snapshot() }
        }
        controller.primaryAction()
        try expect(controller.stage == .opened, "one setup action reaches verified readiness")
        let tail = fake.commands.dropFirst(before).map { Array($0.arguments.dropFirst(2)) }
        try expect(tail == [["--native-install", "--approved"], ["--native-check"]], "configuration followed by exact readiness check")
        try expect(!fake.commands.contains { $0.executable == "/usr/bin/open" || $0.arguments.contains("--native-profile") || $0.arguments.contains("--native-extension") }, "no vendor, manual profile or separate support flow")
        fake.useDynamic = false
        fake.result = CommandResult(exitCode: 42, output: "checksum mismatch", timedOut: false, launchError: nil)
        controller.primaryAction()
        try expect(controller.stage == .retry && !controller.summary.contains("ready"), "failed action never claims readiness")
        fake.useDynamic = true; fake.checkOutput = snapshot()
        let beforeOpenRetry = fake.commands.count
        controller.primaryAction()
        try expect(fake.commands.count == beforeOpenRetry + 1 && fake.commands.last?.arguments.last == "--native-open", "opening retry only calls the checked opener")
        try expect(controller.stage == .opened, "failed opening retries safely without reinstalling")
        try rejected("inconsistent readiness") { _ = try SetupSnapshot.parse(snapshot(["code": 0]).replacingOccurrences(of: "ready=0", with: "ready=1")) }
        try rejected("duplicate protocol keys") { _ = try SetupSnapshot.parse(snapshot().replacingOccurrences(of: "kit=1", with: "kit=1\nkit=1")) }

        let incompleteFake = FakeRunner()
        incompleteFake.result = CommandResult(exitCode: 0, output: snapshot(["kit": 0]), timedOut: false, launchError: nil)
        let incomplete = SetupController(kit: kit, runner: incompleteFake, home: parent)
        incomplete.check()
        try expect(incomplete.stage == .retry && incomplete.selectedFolder == nil, "incomplete kit stops before folder prompt")
        try expect(!fake.commands.contains { $0.arguments.contains("Terminal") }, "fallback never opens Terminal")

        let failedOpenHome = temporary.appendingPathComponent("failed first open home")
        try manager.createDirectory(at: failedOpenHome, withIntermediateDirectories: false)
        let failedOpenRunner = FakeRunner()
        failedOpenRunner.onRun = { command in
            if command.arguments.contains("--native-open") {
                failedOpenRunner.result = CommandResult(exitCode: 42, output: "Fake editor launch failure", timedOut: false, launchError: nil)
            }
        }
        let failedOpenController = SetupController(kit: kit, runner: failedOpenRunner, home: failedOpenHome)
        failedOpenController.check()
        try pump(until: { !failedOpenController.busy })
        try expect(failedOpenController.stage == .retry && failedOpenRunner.commands.filter { $0.arguments.contains("--native-open") }.count == 1, "failed automatic opening offers retry and never loops")
        failedOpenRunner.result = CommandResult(exitCode: 0, output: snapshot(), timedOut: false, launchError: nil)
        failedOpenRunner.onRun = nil
        failedOpenController.check()
        try expect(failedOpenController.stage == .retry && failedOpenRunner.commands.filter { $0.arguments.contains("--native-open") }.count == 1, "readiness recheck after failed opening waits for explicit retry")
        failedOpenRunner.result = CommandResult(exitCode: 0, output: snapshot(["code": 0]), timedOut: false, launchError: nil)
        failedOpenController.check()
        try expect(failedOpenController.stage == .retry, "not-ready check after failed opening never claims completion")
        failedOpenRunner.result = CommandResult(exitCode: 0, output: snapshot(), timedOut: false, launchError: nil)
        failedOpenController.check()
        try expect(failedOpenController.stage == .retry, "readiness restored after failed opening still requires a successful launch")
        let failedOpenCount = failedOpenRunner.commands.count
        failedOpenController.primaryAction()
        try expect(failedOpenController.stage == .opened && failedOpenRunner.commands.count == failedOpenCount + 1 && failedOpenRunner.commands.last?.arguments.last == "--native-open", "explicit retry opens without repeating installation")

        // The persistent app distinguishes first launch from reopening. Every
        // filesystem action stays under these disposable homes; commands are fake.
        let appHome = temporary.appendingPathComponent("app first launch home")
        try manager.createDirectory(at: appHome, withIntermediateDirectories: false)
        let firstRunner = FakeRunner()
        let firstController = SetupController(kit: kit, runner: firstRunner, home: appHome)
        var firstHandoffs = 0; firstController.opened = { firstHandoffs += 1 }
        firstController.launch(); firstController.launch()
        try pump(until: { !firstController.busy })
        try expect(firstController.stage == .opened && firstHandoffs == 1, "first app launch prepares then hands off exactly once")
        try expect(firstRunner.commands.map { $0.arguments.last! } == ["--native-check", "--approved", "--native-check", "--native-open"], "first launch checks, prepares and opens Zero")
        let appKit = appHome.appendingPathComponent("Zero")
        let currentPlan = try KitUpdatePlan(kit: kit, destination: appKit)
        try expect(try currentPlan.matches(kit), "copied runtime matches current app without writes")
        try "my study project".write(to: appKit.appendingPathComponent("starter/Main.java"), atomically: true, encoding: .utf8)
        let warmRunner = FakeRunner(); let warmController = SetupController(kit: kit, runner: warmRunner, home: appHome)
        var warmHandoffs = 0; warmController.opened = { warmHandoffs += 1 }
        let namesBeforeWarm = try manager.contentsOfDirectory(atPath: appHome.path)
        warmController.launch(); warmController.launch()
        try pump(until: { !warmController.busy })
        try expect(warmController.stage == .opened && warmHandoffs == 1, "later app launch hands off exactly once")
        try expect(warmRunner.commands.map { $0.arguments.last! } == ["--native-check", "--native-resume"], "later launch only checks readiness and resumes saved editor session")
        try expect(try manager.contentsOfDirectory(atPath: appHome.path) == namesBeforeWarm, "later launch creates no backups or installation folders")
        try expect(try String(contentsOf: appKit.appendingPathComponent("starter/Main.java")) == "my study project", "later launch preserves student source")
        warmController.launch()
        try expect(warmRunner.commands.count == 2 && warmHandoffs == 1, "same app instance never repeats handoff")
        let repairRunner = FakeRunner(); repairRunner.useDynamic = true; repairRunner.checkOutput = snapshot(["zero": 0])
        repairRunner.onRun = { command in if command.arguments.contains("--native-install") { repairRunner.checkOutput = snapshot() } }
        let repairController = SetupController(kit: kit, runner: repairRunner, home: appHome)
        repairController.launch(); try pump(until: { !repairController.busy })
        try expect(repairController.stage == .opened && repairRunner.commands.map { $0.arguments.last! } == ["--native-check", "--approved", "--native-check", "--native-resume"], "missing editor support repairs once and resumes without recopying")
        try expect(try manager.contentsOfDirectory(atPath: appHome.path) == namesBeforeWarm, "editor repair creates no kit backups")
        let unfinishedRunner = FakeRunner(); unfinishedRunner.useDynamic = true; unfinishedRunner.checkOutput = snapshot(["zero": 0])
        let unfinishedController = SetupController(kit: kit, runner: unfinishedRunner, home: appHome)
        unfinishedController.launch(); try pump(until: { !unfinishedController.busy })
        try expect(unfinishedController.stage == .retry && unfinishedRunner.commands.filter { $0.arguments.contains("--native-install") }.count == 1 && !unfinishedRunner.commands.contains { $0.arguments.contains("--native-resume") }, "incomplete repair cannot loop or hand off")
        let resumeRunner = FakeRunner()
        resumeRunner.onRun = { command in if command.arguments.contains("--native-resume") { resumeRunner.result = CommandResult(exitCode: 42, output: "Fake resume failure", timedOut: false, launchError: nil) } }
        let resumeController = SetupController(kit: kit, runner: resumeRunner, home: appHome)
        var resumeHandoffs = 0; resumeController.opened = { resumeHandoffs += 1 }
        resumeController.launch(); try pump(until: { !resumeController.busy })
        try expect(resumeController.stage == .retry && resumeHandoffs == 0, "failed saved-session opening keeps recovery window")
        resumeRunner.onRun = nil; resumeRunner.result = CommandResult(exitCode: 0, output: snapshot(), timedOut: false, launchError: nil)
        resumeController.primaryAction()
        try expect(resumeController.stage == .opened && resumeHandoffs == 1 && resumeRunner.commands.last?.arguments.last == "--native-resume", "explicit resume retry hands off without reinstalling")
        try "changed setup guide".write(to: appKit.appendingPathComponent("setup/README.md"), atomically: true, encoding: .utf8)
        try expect(try !KitUpdatePlan(kit: kit, destination: appKit).matches(kit), "edited installer-owned runtime never uses warm path")
        let updatedRunner = FakeRunner(); let updatedController = SetupController(kit: kit, runner: updatedRunner, home: appHome)
        updatedController.launch(); try pump(until: { !updatedController.busy })
        try expect(updatedController.stage == .opened && updatedRunner.commands.contains { $0.arguments.contains("--native-install") }, "changed owned runtime is updated before opening")
        try expect(updatedRunner.commands.last?.arguments.last == "--native-resume", "recognized older runtime resumes after migration")
        try expect(try String(contentsOf: appKit.appendingPathComponent("starter/Main.java")) == "my study project", "setup refresh keeps student project")
        try expect(try manager.contentsOfDirectory(atPath: appHome.path).filter { $0.hasPrefix(".zero-setup-backup-") }.count == 1, "only actual setup-file refresh creates a backup")
        let refusedAppHome = temporary.appendingPathComponent("unrelated app launch home")
        try manager.createDirectory(at: refusedAppHome.appendingPathComponent("Zero"), withIntermediateDirectories: true)
        let refusedAppRunner = FakeRunner(); let refusedApp = SetupController(kit: kit, runner: refusedAppRunner, home: refusedAppHome)
        refusedApp.launch(); try pump(until: { !refusedApp.busy })
        try expect(refusedApp.stage == .retry && refusedAppRunner.commands.isEmpty && refusedApp.selectedFolder == nil, "app refuses unrelated Zero folder without executing or overwriting")

        // Runtime work is fully disposable; downloaded bytes are replaced only
        // through a compile-time test hook, never a production environment switch.
        let runtimeKit = try fixture(temporary.appendingPathComponent("runtime kit"))
        try "kitVersion=1.2.3\nextensionId=zero.zero\nvscodeMinimum=1.95.0\n".write(to: runtimeKit.root.appendingPathComponent("setup/kit.properties"), atomically: true, encoding: .utf8)
        let profile = try Data(contentsOf: URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("profile/Zero.code-profile"))
        try profile.write(to: runtimeKit.root.appendingPathComponent("optional/Zero.code-profile"))
        let payload = temporary.appendingPathComponent("fake runtime payload")
        let bin = payload.appendingPathComponent("jdk-test/Contents/Home/bin")
        try MacRuntime.mkdir(bin)
        for (tool, output) in [("java", "openjdk version \\\"21.0.12\\\""), ("javac", "javac 21.0.12")] {
            let script = bin.appendingPathComponent(tool)
            try "#!/bin/bash\necho \(output)\n".write(to: script, atomically: false, encoding: .utf8)
            try manager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: script.path)
        }
        let archive = temporary.appendingPathComponent("valid-jdk.tar.gz")
        _ = try MacRuntime.execute("/usr/bin/tar", ["-czf", archive.path, "-C", payload.path, "jdk-test"])
        let digest = try MacRuntime.execute("/usr/bin/shasum", ["-a", "256", archive.path]).split(separator: " ").first.map(String.init)!
        #if arch(arm64)
        let nodeArchitecture = "arm64"
        #else
        let nodeArchitecture = "x64"
        #endif
        let nodeFolder = "node-v22.21.1-darwin-" + nodeArchitecture
        let nodePayload = payload.appendingPathComponent(nodeFolder), nodeBin = nodePayload.appendingPathComponent("bin")
        try MacRuntime.mkdir(nodeBin)
        let fakeNode = nodeBin.appendingPathComponent("node")
        try "#!/bin/bash\nif [ -n \"${NODE_OPTIONS-}${NODE_PATH-}${ELECTRON_RUN_AS_NODE-}\" ]; then exit 9; fi\necho v22.21.1\n".write(to:fakeNode,atomically:false,encoding:.utf8)
        try manager.setAttributes([.posixPermissions:0o755],ofItemAtPath:fakeNode.path)
        let npm = nodePayload.appendingPathComponent("lib/node_modules/npm/bin/npm-cli.js")
        try MacRuntime.mkdir(npm.deletingLastPathComponent())
        try "fixture only, never run".write(to:npm,atomically:false,encoding:.utf8)
        try manager.createSymbolicLink(atPath:nodeBin.appendingPathComponent("npm").path,withDestinationPath:"../lib/node_modules/npm/bin/npm-cli.js")
        let nodeArchive = temporary.appendingPathComponent("valid-node.tar.gz")
        _ = try MacRuntime.execute("/usr/bin/tar",["-czf",nodeArchive.path,"-C",payload.path,nodeFolder])
        let nodeDigest = try MacRuntime.execute("/usr/bin/shasum",["-a","256",nodeArchive.path]).split(separator:" ").first.map(String.init)!
        func manifest(_ hash: String = digest, _ url: String = "https://github.com/adoptium/test.tar.gz") throws {
            let asset: [String: Any] = ["url": url, "sha256": hash, "format": "tar.gz", "size": (try manager.attributesOfItem(atPath: archive.path)[.size] as! NSNumber).intValue]
            let editor: [String: Any] = ["url": "https://vscode.download.prss.microsoft.com/test.zip", "sha256": String(repeating: "a", count: 64), "format": "zip", "size": 100]
            var architectures: [String:Any] = [:]
            for architecture in ["arm64","x64"] {
                let node: [String:Any] = ["url":"https://nodejs.org/dist/v22.21.1/node-v22.21.1-darwin-\(architecture).tar.gz","sha256":nodeDigest,"version":"22.21.1","format":"tar.gz","size":(try manager.attributesOfItem(atPath:nodeArchive.path)[.size] as! NSNumber).intValue]
                architectures[architecture] = ["jdk":asset,"vscode":editor,"node":node]
            }
            let values: [String: Any] = ["schemaVersion": 1, "architectures": architectures]
            try JSONSerialization.data(withJSONObject: values).write(to: runtimeKit.root.appendingPathComponent("setup/mac-downloads.json"))
        }
        try manifest()
        let argumentRuntime = try MacRuntime(kit: runtimeKit.root, home: temporary.appendingPathComponent("argument home"))
        try rejected("unsigned Node fixture without explicit vendor-test hook") { _ = try argumentRuntime.verifyNodeBinary(fakeNode) }
        let originalNodeScript = try Data(contentsOf:fakeNode)
        try "#!/bin/bash\necho v20.0.0\n".write(to:fakeNode,atomically:false,encoding:.utf8)
        var wrongNodeFixture = argumentRuntime
        wrongNodeFixture.testDownload = { _,_ in } // Compile-time disposable-vendor fixture only.
        try rejected("wrong standalone Node version") { _ = try wrongNodeFixture.verifyNodeBinary(fakeNode) }
        try originalNodeScript.write(to:fakeNode)
        let metadataPath = runtimeKit.root.appendingPathComponent("setup/mac-downloads.json")
        let originalMetadata = try String(contentsOf:metadataPath,encoding:.utf8)
        for bad in [originalMetadata.replacingOccurrences(of:"nodejs.org",with:"nodejs.org.evil.test"),
                    originalMetadata.replacingOccurrences(of:"node-v22.21.1-darwin-",with:"node-v22.21.1-linux-")] {
            try bad.write(to:metadataPath,atomically:false,encoding:.utf8)
            try rejected("unofficial or wrong-platform Node metadata") { _ = try MacRuntime(kit:runtimeKit.root,home:temporary.appendingPathComponent("metadata home")) }
        }
        try originalMetadata.write(to:metadataPath,atomically:false,encoding:.utf8)
        try expect(argumentRuntime.editorArguments(resuming: false) == argumentRuntime.isolated + ["--new-window"], "first runtime opening selects empty window and separate Zero environment")
        try expect(argumentRuntime.editorArguments(resuming: true) == argumentRuntime.isolated, "resume uses separate Zero environment and lets VS Code restore session")
        let updateMarker = argumentRuntime.root.appendingPathComponent("editor/update-ready.json")
        try MacRuntime.mkdir(updateMarker.deletingLastPathComponent())
        try expect(!manager.fileExists(atPath: updateMarker.path), "constructing runtime does not publish update readiness")
        try argumentRuntime.publishEditorUpdate()
        let firstMarker = try JSONSerialization.jsonObject(with: Data(contentsOf: updateMarker)) as! [String: Any]
        try expect(Set(firstMarker.keys) == ["schema", "version", "requestId"] && firstMarker["schema"] as? Int == 1 && firstMarker["version"] as? String == "1.2.3", "update marker records exact bundled version and strict schema")
        try expect(UUID(uuidString: firstMarker["requestId"] as? String ?? "") != nil, "update marker carries a fresh request UUID")
        try argumentRuntime.publishEditorUpdate()
        let secondMarker = try JSONSerialization.jsonObject(with: Data(contentsOf: updateMarker)) as! [String: Any]
        try expect(secondMarker["requestId"] as? String != firstMarker["requestId"] as? String, "each verified opening requests a fresh reload")
        for text in ["student file", "{", "{\"schema\":1,\"version\":\"1.2.3\",\"requestId\":\"invalid\"}", "{\"schema\":1,\"version\":\"1.2.3\",\"requestId\":\"00000000-0000-0000-0000-000000000000\",\"extra\":true}"] {
            try text.write(to: updateMarker, atomically: true, encoding: .utf8)
            try rejected("foreign or malformed update marker") { try argumentRuntime.publishEditorUpdate() }
            try expect(try String(contentsOf: updateMarker) == text, "unrecognized update marker bytes preserved")
        }
        let markerOutside = temporary.appendingPathComponent("outside update marker")
        try "student update marker".write(to: markerOutside, atomically: true, encoding: .utf8)
        try manager.removeItem(at: updateMarker); try manager.createSymbolicLink(at: updateMarker, withDestinationURL: markerOutside)
        try rejected("linked update marker") { try argumentRuntime.publishEditorUpdate() }
        try expect(try String(contentsOf: markerOutside) == "student update marker", "linked update marker never writes outside private profile")
        let runtimeHome = temporary.appendingPathComponent("private runtime home")
        try MacRuntime.mkdir(runtimeHome)
        var runtime = try MacRuntime(kit: runtimeKit.root, home: runtimeHome)
        try expect(try runtime.javaHome() == nil && runtime.nodeExecutable() == nil && !manager.fileExists(atPath: runtime.root.path), "read-only Java and Node discovery create nothing")
        runtime.testDownload = { target, asset in try manager.copyItem(at:asset.url.contains("nodejs.org") ? nodeArchive : archive,to:target) }
        try runtime.install("jdk")
        try runtime.prepareNode()
        try expect(try runtime.nodeExecutable() == runtime.nodeBinary, "pinned standalone Node selected from private hash folder")
        let parentNodeOptions = ProcessInfo.processInfo.environment["NODE_OPTIONS"], parentNodePath = ProcessInfo.processInfo.environment["NODE_PATH"]
        setenv("NODE_OPTIONS","--require=/untrusted-fixture-preload",1); setenv("NODE_PATH","/untrusted-fixture-modules",1)
        defer {
            if let parentNodeOptions { setenv("NODE_OPTIONS",parentNodeOptions,1) } else { unsetenv("NODE_OPTIONS") }
            if let parentNodePath { setenv("NODE_PATH",parentNodePath,1) } else { unsetenv("NODE_PATH") }
        }
        try expect(try runtime.nodeExecutable() == runtime.nodeBinary && runtime.environment(try runtime.javaHome()!)["NODE_OPTIONS"] == nil && runtime.environment(try runtime.javaHome()!)["NODE_PATH"] == nil, "Node version probe and editor environment reject inherited preloads/modules")
        try expect(try manager.destinationOfSymbolicLink(atPath:runtime.nodeBinary.deletingLastPathComponent().appendingPathComponent("npm").path) == "../lib/node_modules/npm/bin/npm-cli.js", "Node npm link extracted only as a contained link, never executed")
        let selected = try runtime.javaHome()!
        try expect(selected.path.hasPrefix(runtime.root.path), "private verified Java selected independently of host JAVA_HOME")
        try expect(runtime.environment(selected)["JAVA_HOME"] == selected.path, "editor and task environment receives private Java")
        try expect(runtime.environment(selected)["ZERO_KIT_DIR"] == runtimeKit.root.path, "editor receives kit location for explicit installation testing")
        try expect(runtime.environment(selected)["ZERO_NODE_EXECUTABLE"] == runtime.nodeBinary.path && runtime.environment(selected)["PATH"]!.contains(runtime.nodeBinary.deletingLastPathComponent().path), "private Node hint and child PATH reach only Zero editor environment")
        try expect(!(try SetupSnapshot.parse(snapshot(["node":0]))).ready, "missing browser runtime prevents ready while Java remains available")
        let nodeReceipt = runtime.node.appendingPathComponent(".zero-asset.json")
        try "unrecognized".write(to:nodeReceipt,atomically:false,encoding:.utf8)
        try rejected("unrecognized private Node is preserved") { try runtime.prepareNode() }
        try expect(try String(contentsOf:nodeReceipt) == "unrecognized", "unrecognized Node receipt never overwritten")
        try nodeDigest.write(to:nodeReceipt,atomically:false,encoding:.utf8)
        try manager.removeItem(at:runtime.nodeBinary)
        try expect(!runtime.nodeReady(), "damaged Node reports repairable unavailable readiness without trapping the setup check")
        runtime.testDownload = { _,_ in throw SetupFailure(message:"fake offline Node repair") }
        try rejected("offline Node repair") { try runtime.prepareNode() }
        try expect(manager.fileExists(atPath:runtime.node.path) && !manager.fileExists(atPath:runtime.nodeBinary.path), "failed Node repair restores recognized previous copy")
        runtime.testDownload = { target, _ in try manager.copyItem(at:nodeArchive,to:target) }
        try runtime.prepareNode()
        try expect(try runtime.nodeExecutable() == runtime.nodeBinary && runtime.nodeReady(), "Node repair replaces only damaged private runtime")
        try expect(runtime.environment(selected)["PATH"]!.hasPrefix(selected.appendingPathComponent("bin").path + ":"), "private compiler wins PATH")
        runtime.testDownload = { _, _ in throw SetupFailure(message: "Unexpected repeat download") }
        try runtime.install("jdk")
        try expect(true, "verified existing runtime installation is idempotent")
        try runtime.seedSettings(selected)
        let settings = runtime.userData.appendingPathComponent("User/settings.json")
        let settingsJSON = try JSONSerialization.jsonObject(with: Data(contentsOf: settings)) as! [String: Any]
        try expect(settingsJSON["files.autoSaveDelay"] as? Int == 500 && settingsJSON["workbench.activityBar.location"] as? String == "hidden", "minimal supplied settings seeded automatically")
        try expect(settingsJSON["java.jdt.ls.java.home"] == nil, "Java extension uses its compatible embedded tooling runtime")
        try "{\"student.setting\": true}".write(to: settings, atomically: true, encoding: .utf8)
        try runtime.seedSettings(selected)
        try expect(try String(contentsOf: settings) == "{\"student.setting\": true}", "later student editor configuration preserved byte-for-byte")
        let outside = temporary.appendingPathComponent("outside settings")
        try "student".write(to: outside, atomically: true, encoding: .utf8)
        try manager.removeItem(at: settings); try manager.createSymbolicLink(at: settings, withDestinationURL: outside)
        try rejected("symlink settings") { try runtime.seedSettings(selected) }
        try expect(try String(contentsOf: outside) == "student", "symlink settings never write outside")
        try manager.removeItem(at: settings)
        var originalLimit = rlimit()
        guard getrlimit(RLIMIT_FSIZE, &originalLimit) == 0 else { throw SetupFailure(message: "Cannot inspect test file-size limit") }
        let oldSignal = signal(SIGXFSZ, SIG_IGN)
        var smallLimit = originalLimit; smallLimit.rlim_cur = 32
        guard setrlimit(RLIMIT_FSIZE, &smallLimit) == 0 else { throw SetupFailure(message: "Cannot set disposable write-failure limit") }
        do {
            try rejected("partial settings write") { try runtime.seedSettings(selected) }
        } catch {
            setrlimit(RLIMIT_FSIZE, &originalLimit); signal(SIGXFSZ, oldSignal); throw error
        }
        guard setrlimit(RLIMIT_FSIZE, &originalLimit) == 0 else { throw SetupFailure(message: "Cannot restore test file-size limit") }
        signal(SIGXFSZ, oldSignal)
        try expect(!manager.fileExists(atPath: settings.path), "failed settings write exposes no partial final JSON")
        try expect(try !manager.contentsOfDirectory(atPath: settings.deletingLastPathComponent().path).contains { $0.hasPrefix(".zero-write-") }, "failed settings staging cleaned")
        try runtime.seedSettings(selected)
        try expect((try? JSONSerialization.jsonObject(with: Data(contentsOf: settings))) != nil, "settings retry publishes complete valid JSON")
        try manager.removeItem(at: settings)
        runtime.testBeforeExchange = { try "student concurrent settings".write(to: settings, atomically: true, encoding: .utf8) }
        try rejected("concurrent initial settings creation") { try runtime.seedSettings(selected) }
        runtime.testBeforeExchange = nil
        try expect(try String(contentsOf: settings) == "student concurrent settings", "exclusive settings publication preserves concurrent student settings")
        let oldPinSettings = try JSONSerialization.data(withJSONObject: ["java.configuration.runtimes": [["name": "JavaSE-21", "path": selected.path]], "student.setting": true], options: [.sortedKeys])
        try oldPinSettings.write(to: settings)
        try manifest(String(repeating: "b", count: 64))
        var badHash = try MacRuntime(kit: runtimeKit.root, home: runtimeHome)
        try badHash.seedSettings(badHash.jdk.appendingPathComponent("jdk/Home"))
        try expect(try Data(contentsOf: settings) == oldPinSettings && manager.fileExists(atPath: selected.path), "changed Java digest preserves existing settings bytes and referenced old JDK")
        badHash.testDownload = { target, _ in try manager.copyItem(at: archive, to: target) }
        try rejected("checksum mismatch") { try badHash.install("jdk") }
        try expect(!manager.fileExists(atPath: badHash.jdk.path), "unverified download never installed")
        try expect(try !manager.contentsOfDirectory(atPath: runtime.root.appendingPathComponent("runtime").path).contains { $0.hasPrefix(".install-") }, "failed download owned staging cleaned for retry")
        try manifest(digest, "http://github.com/insecure.tar.gz")
        try rejected("insecure manifest") { _ = try MacRuntime(kit: runtimeKit.root, home: runtimeHome) }
        try manifest()
        let malformed = temporary.appendingPathComponent("malformed.zip")
        try Data("broken archive".utf8).write(to: malformed)
        let extraction = temporary.appendingPathComponent("malformed extraction")
        try MacRuntime.mkdir(extraction)
        try rejected("malformed archive") { try SafeMacArchive.extract(malformed, to: extraction) }
        let escaping = payload.appendingPathComponent("escape")
        try manager.createSymbolicLink(at: escaping, withDestinationURL: outside)
        let unsafeArchive = temporary.appendingPathComponent("unsafe-links.tar.gz")
        _ = try MacRuntime.execute("/usr/bin/tar", ["-czf", unsafeArchive.path, "-C", payload.path, "escape"])
        try rejected("archive escaping symlink") { try SafeMacArchive.extract(unsafeArchive, to: extraction) }
        try expect(try String(contentsOf: outside) == "student", "unsafe archive cannot modify external files")
        let brokenArchive = temporary.appendingPathComponent("broken-link.tar.gz")
        try manager.createSymbolicLink(atPath:payload.appendingPathComponent("broken").path,withDestinationPath:"missing-target")
        _ = try MacRuntime.execute("/usr/bin/tar",["-czf",brokenArchive.path,"-C",payload.path,"broken"])
        try rejected("archive broken contained symlink") { try SafeMacArchive.extract(brokenArchive,to:extraction) }

        let traversalArchive = temporary.appendingPathComponent("traversal.tar.gz")
        _ = try MacRuntime.execute("/usr/bin/tar", ["-czf", traversalArchive.path, "-s", "|^jdk-test|../escaped|", "-C", payload.path, "jdk-test"])
        try rejected("archive parent traversal") { try SafeMacArchive.extract(traversalArchive, to: extraction) }
        try expect(!manager.fileExists(atPath: temporary.appendingPathComponent("escaped").path), "archive traversal writes no parent files")
        let launcher = runtimeKit.root.appendingPathComponent("Open Zero.command")
        try "student launcher".write(to: launcher, atomically: true, encoding: .utf8)
        try rejected("student-owned launcher") { try runtime.validateLauncher() }
        try expect(try String(contentsOf: launcher) == "student launcher", "launcher collision preserves student file")
        try manager.removeItem(at: launcher)
        try runtime.launcher(cli: URL(fileURLWithPath: "/fake editor/code"), java: selected)
        let generated = try String(contentsOf: launcher)
        try expect(generated.contains("export ZERO_NODE_EXECUTABLE=" + MacRuntime.quote(runtime.nodeBinary.path)) && generated.contains("NODE_OPTIONS NODE_PATH"), "owned launcher carries private Node path and clears inherited injection")
        try expect(generated.contains("--new-window") && !generated.contains(runtimeKit.root.appendingPathComponent("starter").path), "standalone fallback opens empty tutorial window")
        try expect(generated.contains("--user-data-dir") && generated.contains("--extensions-dir") && generated.contains("export JAVA_HOME=") && generated.contains("export ZERO_KIT_DIR=" + MacRuntime.quote(runtimeKit.root.path)), "standalone launcher preserves private editor, Java and kit location after DMG closes")
        try manager.removeItem(at: launcher)
        runtime.testBeforeExchange = { try "student newly created launcher".write(to: launcher, atomically: true, encoding: .utf8) }
        try rejected("concurrent launcher creation") { try runtime.launcher(cli: URL(fileURLWithPath: "/fake code"), java: selected) }
        runtime.testBeforeExchange = nil
        try expect(try String(contentsOf: launcher) == "student newly created launcher", "exclusive launcher publication preserves concurrent creation")
        try generated.write(to: launcher, atomically: true, encoding: .utf8)
        runtime.testBeforeExchange = { try "student replacement after ownership check".write(to: launcher, atomically: true, encoding: .utf8) }
        try rejected("launcher replacement between identity check and exchange") { try runtime.launcher(cli: URL(fileURLWithPath: "/fake code"), java: selected) }
        runtime.testBeforeExchange = nil
        try expect(try String(contentsOf: launcher) == "student replacement after ownership check", "exchanged actual concurrent launcher restored")
        try generated.write(to: launcher, atomically: true, encoding: .utf8)
        runtime.testAfterExchange = { try "student post-publication edit".write(to: launcher, atomically: true, encoding: .utf8) }
        try rejected("launcher edit after exchange") { try runtime.launcher(cli: URL(fileURLWithPath: "/fake code"), java: selected) }
        runtime.testAfterExchange = nil
        let recoveries = try manager.contentsOfDirectory(at: runtimeKit.root, includingPropertiesForKeys: nil).filter { $0.lastPathComponent.hasPrefix(".zero-write-") }
        try expect(try String(contentsOf: launcher) == "student post-publication edit", "later launcher edit remains at its chosen filename")
        try expect(try recoveries.contains { try String(contentsOf: $0) == generated }, "prior launcher retained as an explicit recovery file")
        for file in recoveries { try manager.removeItem(at: file) }
        try generated.write(to: launcher, atomically: true, encoding: .utf8)
        let movedRuntimeKit = runtimeKit.root.deletingLastPathComponent().appendingPathComponent("runtime kit moved during launcher")
        let externalKit = temporary.appendingPathComponent("external kit untouched")
        try MacRuntime.mkdir(externalKit)
        let externalLauncher = externalKit.appendingPathComponent("Open Zero.command")
        try "external student launcher".write(to: externalLauncher, atomically: true, encoding: .utf8)
        runtime.testBeforeExchange = {
            try manager.moveItem(at: runtimeKit.root, to: movedRuntimeKit)
            try manager.createSymbolicLink(at: runtimeKit.root, withDestinationURL: externalKit)
        }
        try rejected("launcher ancestor drift during exchange") { try runtime.launcher(cli: URL(fileURLWithPath: "/fake code"), java: selected) }
        runtime.testBeforeExchange = nil
        try expect(try String(contentsOf: externalLauncher) == "external student launcher", "anchored launcher writes never follow raced ancestor link")
        try expect(try String(contentsOf: movedRuntimeKit.appendingPathComponent("Open Zero.command")) == generated, "ancestor drift restores prior generated launcher in anchored folder")
        try manager.removeItem(at: runtimeKit.root); try manager.moveItem(at: movedRuntimeKit, to: runtimeKit.root)
        let privateLinkHome = temporary.appendingPathComponent("linked private home")
        try MacRuntime.mkdir(privateLinkHome.appendingPathComponent("Library/Application Support"))
        try manager.createSymbolicLink(at: privateLinkHome.appendingPathComponent("Library/Application Support/Zero"), withDestinationURL: runtime.root)
        let linkedRuntime = try MacRuntime(kit: runtimeKit.root, home: privateLinkHome)
        try rejected("private root symlink") { try MacRuntime.mkdir(linkedRuntime.root) }

        let developmentLabel = SetupBuildLabel(info: ["ZeroDevelopmentBuild": true, "CFBundleShortVersionString": "0.5.4"])
        let signedLabel = SetupBuildLabel(info: ["ZeroDevelopmentBuild": false, "CFBundleShortVersionString": "0.5.4"])
        try expect(developmentLabel.windowTitle.contains("unsigned development"), "development title is explicit")
        try expect(developmentLabel.detail.contains("local testing only"), "development detail is honest")
        try expect(signedLabel.windowTitle == "Zero", "signed title uses product name")
        try expect(signedLabel.detail == "Zero 0.5.4", "signed detail states version without notarization claim")
        try expect(SetupBuildLabel(info: [:]).development, "missing build marker defaults to development")

        if CommandLine.arguments.contains("--no-ui") { print("Zero native setup no-UI tests: \(passed) checks passed"); return }
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        try updaterTests(app: app, kit: kit, home: temporary)
        let pausedRunner = FakeRunner()
        pausedRunner.paused = true
        let pausedController = SetupController(kit: kit, runner: pausedRunner, home: parent)
        let pausedWindow = SetupWindow(controller: pausedController)
        let locationButton = pausedWindow.window?.contentView?.subviews.compactMap { $0 as? NSButton }.first { $0.title == "Change location…" }
        try expect(locationButton == nil, "location button absent during initial checking")
        let delegate = SetupApplication()
        delegate.setupWindow = pausedWindow
        pausedController.check()
        try expect(!pausedWindow.windowShouldClose(pausedWindow.window!), "window close rejected while check paused")
        try expect(delegate.applicationShouldTerminate(app) == .terminateCancel, "application quit rejected while check paused")
        try expect(pausedController.summary.contains("Please wait"), "shutdown rejection explains active work")
        pausedRunner.finish()
        try expect(!pausedWindow.window!.contentView!.subviews.contains { ($0 as? NSButton)?.title == "Change location…" }, "location button absent at default folder stage")
        try expect(!pausedWindow.windowShouldClose(pausedWindow.window!) && delegate.applicationShouldTerminate(app) == .terminateCancel, "shutdown stays gated as check enters automatic preparation")
        try expect(locationButton == nil, "no location button during placement")
        try expect(!pausedController.mayExit(), "copy owns shutdown until completion")
        try pump(until: { pausedRunner.pending != nil })
        pausedRunner.finish()
        try pump(until: { pausedRunner.pending != nil })
        pausedRunner.finish()
        try expect(!pausedController.mayExit() && pausedRunner.commands.last?.arguments.last == "--native-resume", "shutdown stays gated during recognized-kit session opening")
        pausedRunner.finish()
        try expect(pausedController.mayExit() && pausedWindow.windowShouldClose(pausedWindow.window!) && delegate.applicationShouldTerminate(app) == .terminateNow, "copy, configure, recheck and automatic open release shutdown after completion")
        let handoffHome = temporary.appendingPathComponent("application delegate home")
        try manager.createDirectory(at: handoffHome, withIntermediateDirectories: false)
        let handoffRunner = FakeRunner()
        let handoffController = SetupController(kit: kit, runner: handoffRunner, home: handoffHome)
        let handoffDelegate = SetupApplication(); var handoffCount = 0
        handoffDelegate.handOff = { handoffCount += 1 }
        handoffDelegate.start(handoffController)
        try pump(until: { !handoffController.busy })
        try expect(handoffCount == 1 && handoffController.stage == .opened, "real application delegate wires successful launch to a single handoff")
        try expect(handoffDelegate.applicationShouldTerminate(app) == .terminateNow, "completed handoff allows preparation app to exit")
        handoffDelegate.setupWindow?.close()
        let progressHome = temporary.appendingPathComponent("progress home")
        try manager.createDirectory(at: progressHome, withIntermediateDirectories: false)
        let progressRunner = FakeRunner(); progressRunner.paused = true
        let progressController = SetupController(kit: kit, runner: progressRunner, home: progressHome)
        progressController.check()
        try expect(progressController.completedSteps == 0, "preparation begins with an empty bar")
        progressRunner.progress?("verify")
        try expect(progressController.completedSteps == 0, "stage tokens outside configuration cannot advance progress")
        progressRunner.finish()
        try expect(progressController.completedSteps == 1, "successful initial check advances one step")
        try pump(until: { progressRunner.pending != nil })
        for (token, completed) in [("java", 2), ("editor", 3), ("settings", 4), ("zero", 5), ("redhat", 6), ("verify", 7)] {
            progressRunner.progress?(token)
            try expect(progressController.completedSteps == completed && completed < SetupController.totalSteps, "actual stage advances progress: \(token)")
        }
        progressRunner.progress?("editor"); progressRunner.progress?("unknown")
        try expect(progressController.completedSteps == 7, "stale and unknown tokens do not change progress")
        progressRunner.result = CommandResult(exitCode: 42, output: "injected verification failure", timedOut: false, launchError: nil)
        progressRunner.finish()
        try expect(progressController.stage == .retry && progressController.completedSteps == 7, "failure never fills the bar")
        progressRunner.result = CommandResult(exitCode: 0, output: snapshot(), timedOut: false, launchError: nil)
        progressController.primaryAction()
        try expect(progressController.completedSteps == 2, "retry resets progress to the prepared folder")
        progressRunner.progress?("verify")
        try expect(progressController.completedSteps == 7, "skipped installed components count before verification")
        progressRunner.finish()
        try expect(progressController.completedSteps == 8 && progressController.busy, "successful configuration waits for final readiness")
        progressRunner.finish()
        try expect(progressController.completedSteps == SetupController.totalSteps && progressController.busy && progressRunner.commands.last?.arguments.last == "--native-open", "verified readiness fills the bar and automatically starts opening")
        progressController.primaryAction(); progressController.check()
        try expect(progressRunner.commands.filter { $0.arguments.contains("--native-open") }.count == 1, "busy opening ignores duplicate actions and checks")
        progressRunner.finish()
        try expect(progressController.stage == .opened && !progressController.busy, "only successful opening completes setup")
        // Exercise the real runner only against disposable scripts, never tools.
        let fakeScript = temporary.appendingPathComponent("fake script ; $x.sh")
        try "#!/bin/bash\nprintf 'captured output\\n'\nexit 7\n".write(to: fakeScript, atomically: true, encoding: .utf8)
        var actual: CommandResult?
        let runner = NativeCommandRunner()
        runner.run(SetupCommand(executable: "/bin/bash", arguments: [fakeScript.path]), timeout: 2) { actual = $0 }
        try pump(until: { actual != nil })
        try expect(actual!.exitCode == 7 && actual!.output.contains("captured output") && !actual!.succeeded, "real runner captures failure")
        let nestedPID = temporary.appendingPathComponent("nested child.pid")
        actual = nil
        runner.run(SetupCommand(executable: Bundle.main.executableURL!.path, arguments: ["--nested-timeout-helper", nestedPID.path]), timeout: 1) { actual = $0 }
        try pump(until: { actual != nil }, seconds: 5)
        try expect(actual!.timedOut, "outer runtime timeout remains bounded")
        let childPID = pid_t((try String(contentsOf: nestedPID)).trimmingCharacters(in: .whitespacesAndNewlines))!
        try pump(until: { kill(childPID, 0) != 0 }, seconds: 5)
        try expect(errno == ESRCH, "outer runtime timeout stops nested tool children in inherited group")
        try "#!/bin/bash\nkill -TERM $$\nprintf 'survived TERM\\n'\n".write(to: fakeScript, atomically: true, encoding: .utf8)
        actual = nil
        let termStarted = ProcessInfo.processInfo.systemUptime
        runner.run(SetupCommand(executable: "/bin/bash", arguments: [fakeScript.path]), timeout: 3) { actual = $0 }
        try pump(until: { actual != nil })
        try expect(actual!.exitCode == nil && !actual!.timedOut && !actual!.output.contains("survived TERM"), "GCD-spawned Bash receives normal TERM")
        try expect(ProcessInfo.processInfo.systemUptime - termStarted < 2, "TERM finishes without outer timeout escalation")
        let timerReady = temporary.appendingPathComponent("timer ready ; $x")
        try """
        #!/bin/bash
        /usr/bin/true & probe_pid=$!
        (
          sleep 20 & timer_sleep=$!
          trap 'kill "$timer_sleep" 2>/dev/null; printf "timer cleaned\\n"; exit 0' TERM
          : > "$1"
          wait "$timer_sleep"
        ) & timer_pid=$!
        while [ ! -f "$1" ]; do sleep 0.01; done
        wait "$probe_pid"
        kill -TERM "$timer_pid"
        wait "$timer_pid"
        printf 'probe complete\\n'
        """.write(to: fakeScript, atomically: true, encoding: .utf8)
        actual = nil
        let timerStarted = ProcessInfo.processInfo.systemUptime
        runner.run(SetupCommand(executable: "/bin/bash", arguments: [fakeScript.path, timerReady.path]), timeout: 4) { actual = $0 }
        try pump(until: { actual != nil }, seconds: 6)
        try expect(actual!.succeeded && actual!.output.contains("timer cleaned") && actual!.output.contains("probe complete"), "probe timer TERM trap completes normally")
        try expect(ProcessInfo.processInfo.systemUptime - timerStarted < 2, "successful probe cleanup does not wait for its 20 second timer")
        try "#!/bin/bash\nsleep 30 &\nwait\n".write(to: fakeScript, atomically: true, encoding: .utf8)
        actual = nil
        runner.run(SetupCommand(executable: "/bin/bash", arguments: [fakeScript.path]), timeout: 0.1) { actual = $0 }
        try pump(until: { actual != nil })
        try expect(actual!.timedOut && !actual!.succeeded, "real runner times out descendants")
        actual = nil
        runner.run(SetupCommand(executable: "/no/such/executable", arguments: []), timeout: 1) { actual = $0 }
        try pump(until: { actual != nil })
        try expect(actual!.launchError != nil && !actual!.succeeded, "real spawn failure captured")
        let descendantPIDFile = temporary.appendingPathComponent("detached-child.pid")
        defer {
            if let text = try? String(contentsOf: descendantPIDFile, encoding: .utf8), let pid = Int32(text) { kill(pid, SIGKILL) }
        }
        actual = nil
        let detachedStarted = ProcessInfo.processInfo.systemUptime
        runner.run(SetupCommand(executable: URL(fileURLWithPath: CommandLine.arguments[0]).path,
                                arguments: ["--detached-pipe-helper", descendantPIDFile.path]), timeout: 2) { actual = $0 }
        try pump(until: { actual != nil }, seconds: 4)
        try expect(ProcessInfo.processInfo.systemUptime - detachedStarted < 3, "detached pipe capture completes promptly")
        try expect(actual!.exitCode == 0 && actual!.launchError?.contains("capture was incomplete") == true && !actual!.succeeded,
                   "detached pipe cannot turn zero exit into verified readiness")
        print("Mac native setup: \(passed) assertions passed (disposable files/fake tools; no installs, Terminal or accounts).")

        if let option = CommandLine.arguments.firstIndex(of: "--preview"), option + 1 < CommandLine.arguments.count {
            let app = NSApplication.shared
            app.setActivationPolicy(.prohibited)
            let previewRunner = FakeRunner(); previewRunner.paused = true
            let previewHome = temporary.appendingPathComponent("preview home")
            try manager.createDirectory(at: previewHome, withIntermediateDirectories: false)
            let previewController = SetupController(kit: kit, runner: previewRunner, home: previewHome)
            let window = SetupWindow(controller: previewController)
            window.window?.appearance = NSAppearance(named: .aqua)
            guard let content = window.window?.contentView else { throw SetupFailure(message: "No preview view") }
            content.wantsLayer = true
            content.layer?.backgroundColor = NSColor(calibratedWhite: 0.96, alpha: 1).cgColor
            let controls = content.subviews.flatMap { ($0 as? NSStackView)?.views ?? [$0] }
            let buttons = controls.compactMap { $0 as? NSButton }
            let details = buttons.first { $0.title == "Details…" }!
            let primary = buttons.first { $0.title != "Details…" }!
            let bar = controls.compactMap { $0 as? NSProgressIndicator }.first!
            let output = URL(fileURLWithPath: CommandLine.arguments[option + 1])
            func render(_ destination: URL) throws {
                // Allow queued layout/drawing work before caching the offscreen view.
                // Verify visible fill with the interactive progress scenario instead.
                RunLoop.current.run(until: Date().addingTimeInterval(0.4))
                content.layoutSubtreeIfNeeded()
                guard let bitmap = content.bitmapImageRepForCachingDisplay(in: content.bounds) else { throw SetupFailure(message: "Cannot render preview") }
                NSAppearance(named: .aqua)?.performAsCurrentDrawingAppearance {
                    content.cacheDisplay(in: content.bounds, to: bitmap)
                }
                guard let png = bitmap.representation(using: .png, properties: [:]) else { throw SetupFailure(message: "Cannot encode preview") }
                try png.write(to: destination)
            }
            previewController.check()
            try expect(previewController.summary == "Preparing Zero…" && primary.isHidden && details.isHidden, "preparation shows progress without buttons")
            try expect(bar.style == .bar && !bar.isIndeterminate && !bar.isHidden && bar.doubleValue == 0, "native preparation uses an empty determinate bar")
            try render(output.deletingPathExtension().appendingPathExtension("preparing.png"))
            previewRunner.finish()
            try pump(until: { previewRunner.pending != nil })
            previewRunner.progress?("editor")
            try expect(bar.doubleValue == 3 && !bar.isIndeterminate, "bar reflects completed setup stages")
            try render(output.deletingPathExtension().appendingPathExtension("progress.png"))
            previewRunner.finish() // Configuration completes; readiness check is pending.
            previewRunner.finish() // Readiness completes; opening starts automatically.
            try expect(bar.isIndeterminate && !bar.isHidden && primary.isHidden, "automatic opening shows a busy bar and prevents duplicate actions")
            previewRunner.finish()
            try expect(!bar.isIndeterminate && bar.doubleValue == bar.maxValue && primary.title == "Open Zero again" && !primary.isHidden,
                       "completed opening restores a full bar and the repeat action")
            try expect(details.isHidden, "successful automatic opening keeps details hidden")
            try render(output)
            previewRunner.paused = false
            previewRunner.result = CommandResult(exitCode: 42, output: "Fake network failure; no host changes.", timedOut: false, launchError: nil)
            previewController.primaryAction()
            try expect(primary.title == "Try again" && !primary.isHidden && !details.isHidden, "failure retains retry and diagnostics")
            try expect(bar.isHidden, "failure hides progress and keeps recovery controls")
            try render(output.deletingPathExtension().appendingPathExtension("failure.png"))
            print("Rendered preparing/ready/failure AppKit previews from fake checks: \(output.path)")
            print("Mac native setup including UI: \(passed) assertions passed.")
        }
    }
}
#endif
