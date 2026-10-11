import AppKit
import Foundation
import Darwin

#if ZERO_SETUP_TESTS
private func snapshot(_ overrides: [String: Int] = [:]) -> String {
    var values = ["kit": 1, "code": 1, "java": 1, "profile": 1, "zero": 1, "redhat": 1, "javaHomeBlocked": 0]
    values.merge(overrides) { _, new in new }
    values["ready"] = ["kit", "code", "java", "profile", "zero", "redhat"].allSatisfy { values[$0] == 1 } ? 1 : 0
    return "ZERO_SETUP_V1\n" + values.keys.sorted().map { "\($0)=\(values[$0]!)" }.joined(separator: "\n") + "\nEND_ZERO_SETUP\n"
}
private final class FakeRunner: SetupCommandRunning {
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

    static func main() throws {
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
        let temporary = manager.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("Zero native tests \(UUID().uuidString)")
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
            case "tools": fake.plan = "install"; fake.checkOutput = snapshot(["code": 0, "profile": 0, "zero": 0, "redhat": 0])
            case "profile": fake.checkOutput = snapshot(["profile": 0, "zero": 0, "redhat": 0])
            case "extensions": fake.checkOutput = snapshot(["zero": 0, "redhat": 0])
            case "failure": fake.useDynamic = false; fake.result = CommandResult(exitCode: 42, output: "Fake network failure. No host changes.", timedOut: false, launchError: nil)
            default: fake.checkOutput = snapshot()
            }
            fake.onRun = { command in
                if command.arguments.contains("--native-install") { fake.checkOutput = snapshot(["profile": 0, "zero": 0, "redhat": 0]) }
                if command.arguments.contains("--native-profile") { fake.checkOutput = snapshot(["zero": 0, "redhat": 0]) }
                if command.arguments.contains("--native-extension") && command.arguments.contains("java") { fake.checkOutput = snapshot() }
            }
            let app = NSApplication.shared; app.setActivationPolicy(.regular)
            let controller = SetupController(kit: kit, runner: fake)
            let window = SetupWindow(controller: controller)
            let delegate = SetupApplication(); delegate.setupWindow = window
            // No production launch delegate is installed: this harness exclusively
            // owns disposable fixtures and fake commands, including approvals.
            window.window?.title = "Zero Setup — safe fake preview"
            window.showWindow(nil); app.activate(ignoringOtherApps: true)
            controller.place(parent: parent, name: "Preview kit")
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

        let fake = FakeRunner()
        let controller = SetupController(kit: kit, runner: fake)
        try expect(fake.commands.isEmpty, "controller waits for launch-triggered check")
        controller.place(parent: nil, name: nil)
        try expect(fake.commands.isEmpty && controller.selectedFolder == nil && !controller.busy, "cancelled selection executes nothing")
        controller.primaryAction()
        try expect(fake.commands.isEmpty, "initial action cannot launch editor")
        controller.check()
        try expect(fake.commands == [SetupCommand(executable: "/bin/bash", arguments: [kit.root.appendingPathComponent("setup/setup.sh").path, "--native-check"])], "check uses fixed argv")
        try expect(fake.timeouts == [180] && controller.stage == .chooseFolder, "read-only check precedes folder")
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
        controller.place(parent: parent, name: "Controller kit ; $x")
        try pump(until: { !controller.busy })
        try expect(controller.selectedFolder != nil && controller.stage == .ready, "placed complete kit ready only after recheck")
        try expect(!fake.commands.contains { $0.arguments.contains("--native-install") || $0.arguments.contains("--native-extension") }, "compatible tool/profile/extension installs skipped")
        controller.primaryAction()
        try expect(fake.commands.last?.arguments.last == "--native-open" && controller.stage == .opened, "final Open Zero explicit")
        let copied = controller.selectedFolder!
        controller.check()
        try expect(fake.commands.last == SetupCommand(executable: "/bin/bash", arguments: [copied.appendingPathComponent("setup/setup.sh").path, "--native-check"]), "recheck probes copied kit")
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
        fake.checkOutput = snapshot(["code": 0]); fake.plan = "install"
        controller.check()
        try expect(controller.stage == .toolConsent("code", "install"), "missing Code needs fixed command consent")
        let countBeforeConsent = fake.commands.count
        controller.approve(false)
        try expect(fake.commands.count == countBeforeConsent, "cancelled install consent launches nothing")
        fake.onRun = { command in if command.arguments.contains("--native-install") { fake.checkOutput = snapshot(["profile": 0, "zero": 0, "redhat": 0]) } }
        controller.approve(true)
        try expect(controller.stage == .profileConsent, "approved tool install rechecks before profile")
        try expect(fake.commands.contains { $0.arguments.suffix(4) == ["--native-install", "code", "install", "--approved"] }, "native consent bound to exact install")
        controller.approve(false)
        try expect(controller.stage == .profileConsent, "cancelled profile preserves stage")
        controller.approve(true)
        try expect(controller.stage == .profileWaiting, "profile handoff cannot claim import complete")
        controller.primaryAction()
        try expect(controller.stage == .profileConsent, "missing profile after handoff stays unready")
        fake.checkOutput = snapshot(["zero": 0, "redhat": 0]); controller.check()
        try expect(controller.stage == .extensionConsent, "extension consent only after tools and profile")
        let beforeExtensions = fake.commands.count
        controller.approve(false)
        try expect(fake.commands.count == beforeExtensions, "cancelled extension consent preserves profile")
        fake.onRun = { command in
            if command.arguments.contains("--native-extension") && command.arguments.contains("java") { fake.checkOutput = snapshot() }
        }
        controller.approve(true)
        let tail = Array(fake.commands.suffix(3)).map { Array($0.arguments.dropFirst()) }
        try expect(tail == [["--native-extension", "zero", "--approved"], ["--native-extension", "java", "--approved"], ["--native-check"]], "required extensions installed sequentially then verified")
        try expect(controller.stage == .ready, "ready follows verified extension response")
        fake.checkOutput = snapshot(["java": 0, "javaHomeBlocked": 1]); controller.check()
        try expect(controller.stage == .blockedJava, "explicit invalid JAVA_HOME never installs over selection")
        fake.plan = "manual"; fake.checkOutput = snapshot(["java": 0]); controller.check()
        try expect(controller.stage == .manualTool("java"), "JDK elevation uses vendor flow")
        fake.checkOutput = snapshot(["zero": 0]); controller.check()
        fake.useDynamic = false
        fake.result = CommandResult(exitCode: 42, output: "network failure", timedOut: false, launchError: nil)
        controller.approve(true)
        try expect(controller.stage == .retry && !controller.summary.contains("ready"), "failed extension never ready")
        fake.useDynamic = true; fake.checkOutput = snapshot(); controller.primaryAction()
        try expect(controller.stage == .ready, "retry can recover through a fresh check")
        try expect(!fake.commands.contains { $0.arguments.contains("Terminal") }, "native flow never launches Terminal")
        try expect(!controller.summary.contains("\n") && controller.summary.count < 60, "default status always one short line")
        try rejected("inconsistent readiness") { _ = try SetupSnapshot.parse(snapshot(["code": 0]).replacingOccurrences(of: "ready=0", with: "ready=1")) }
        try rejected("duplicate protocol keys") { _ = try SetupSnapshot.parse(snapshot().replacingOccurrences(of: "kit=1", with: "kit=1\nkit=1")) }

        fake.checkOutput = snapshot(["code": 0]); fake.plan = "install"; controller.check()
        fake.useDynamic = false; fake.result = CommandResult(exitCode: 0, output: "brew waiting", timedOut: true, launchError: nil)
        controller.approve(true)
        try expect(controller.stage == .manualTool("code") && controller.primaryTitle == "Open download page", "brew timeout offers deliberate vendor fallback")
        try expect(controller.diagnostics.contains("timed out") || controller.diagnostics.contains("exceeded"), "brew timeout retained in details")
        let incompleteFake = FakeRunner()
        incompleteFake.result = CommandResult(exitCode: 0, output: snapshot(["kit": 0]), timedOut: false, launchError: nil)
        let incomplete = SetupController(kit: kit, runner: incompleteFake)
        incomplete.check()
        try expect(incomplete.stage == .retry && incomplete.selectedFolder == nil, "incomplete kit stops before folder prompt")
        try expect(!fake.commands.contains { $0.arguments.contains("Terminal") }, "fallback never opens Terminal")

        let developmentLabel = SetupBuildLabel(info: ["ZeroDevelopmentBuild": true, "CFBundleShortVersionString": "0.5.4"])
        let signedLabel = SetupBuildLabel(info: ["ZeroDevelopmentBuild": false, "CFBundleShortVersionString": "0.5.4"])
        try expect(developmentLabel.windowTitle.contains("unsigned development"), "development title is explicit")
        try expect(developmentLabel.detail.contains("local testing only"), "development detail is honest")
        try expect(signedLabel.windowTitle == "Zero Setup", "signed title uses product name")
        try expect(signedLabel.detail == "Zero Setup 0.5.4", "signed detail states version without notarization claim")
        try expect(SetupBuildLabel(info: [:]).development, "missing build marker defaults to development")

        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let pausedRunner = FakeRunner()
        pausedRunner.paused = true
        let pausedController = SetupController(kit: kit, runner: pausedRunner)
        let pausedWindow = SetupWindow(controller: pausedController)
        let delegate = SetupApplication()
        delegate.setupWindow = pausedWindow
        pausedController.check()
        try expect(!pausedWindow.windowShouldClose(pausedWindow.window!), "window close rejected while check paused")
        try expect(delegate.applicationShouldTerminate(app) == .terminateCancel, "application quit rejected while check paused")
        try expect(pausedController.summary.contains("Please wait"), "shutdown rejection explains active work")
        pausedRunner.finish()
        try expect(pausedWindow.windowShouldClose(pausedWindow.window!) && delegate.applicationShouldTerminate(app) == .terminateNow, "close and quit allowed after check finishes")
        pausedController.place(parent: parent, name: "Paused copy")
        try expect(!pausedController.mayExit(), "copy owns shutdown until completion")
        try pump(until: { pausedRunner.pending != nil })
        pausedRunner.finish()
        try expect(pausedController.mayExit(), "copy and recheck release shutdown after completion")
        // Exercise the real runner only against disposable scripts, never tools.
        let fakeScript = temporary.appendingPathComponent("fake script ; $x.sh")
        try "#!/bin/bash\nprintf 'captured output\\n'\nexit 7\n".write(to: fakeScript, atomically: true, encoding: .utf8)
        var actual: CommandResult?
        let runner = NativeCommandRunner()
        runner.run(SetupCommand(executable: "/bin/bash", arguments: [fakeScript.path]), timeout: 2) { actual = $0 }
        try pump(until: { actual != nil })
        try expect(actual!.exitCode == 7 && actual!.output.contains("captured output") && !actual!.succeeded, "real runner captures failure")
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
            let previewController = SetupController(kit: kit, runner: FakeRunner())
            previewController.place(parent: parent, name: "Preview ready")
            try pump(until: { !previewController.busy })
            let window = SetupWindow(controller: previewController)
            window.window?.appearance = NSAppearance(named: .aqua)
            guard let content = window.window?.contentView else { throw SetupFailure(message: "No preview view") }
            content.wantsLayer = true
            content.layer?.backgroundColor = NSColor(calibratedWhite: 0.96, alpha: 1).cgColor
            content.layoutSubtreeIfNeeded()
            guard let bitmap = content.bitmapImageRepForCachingDisplay(in: content.bounds) else { throw SetupFailure(message: "Cannot render preview") }
            NSAppearance(named: .aqua)?.performAsCurrentDrawingAppearance {
                content.cacheDisplay(in: content.bounds, to: bitmap)
            }
            guard let png = bitmap.representation(using: .png, properties: [:]) else { throw SetupFailure(message: "Cannot encode preview") }
            try png.write(to: URL(fileURLWithPath: CommandLine.arguments[option + 1]))
            print("Rendered AppKit preview from fake checks: \(CommandLine.arguments[option + 1])")
        }
    }
}
#endif
