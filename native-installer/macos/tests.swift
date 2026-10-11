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
                       "setup/Setup.cmd", "setup/Setup.ps1", "setup/README.md", "LICENSE",
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
                if command.executable == "/usr/bin/open" { fake.checkOutput = snapshot(["profile": 0, "zero": 0, "redhat": 0]) }
                if command.arguments.contains("--native-profile") && scenario != "profile-unfinished" { fake.checkOutput = snapshot(["zero": 0, "redhat": 0]) }
                if command.arguments.contains("--native-extension") && command.arguments.contains("java") { fake.checkOutput = snapshot() }
            }
            let app = NSApplication.shared; app.setActivationPolicy(.regular)
            let controller = SetupController(kit: kit, runner: fake, home: parent)
            let window = SetupWindow(controller: controller)
            let delegate = SetupApplication(); delegate.setupWindow = window
            // No production launch delegate is installed: this harness exclusively
            // owns disposable fixtures and fake commands, including approvals.
            window.window?.title = "Zero Setup — safe fake preview"
            window.showWindow(nil); app.activate(ignoringOtherApps: true)
            if scenario == "update" {
                let existing = try kit.place(parent: parent, name: "Zero")
                try "student code".write(to: existing.appendingPathComponent("starter/Main.java"), atomically: true, encoding: .utf8)
                try "student save".write(to: existing.appendingPathComponent("starter/save.dat"), atomically: true, encoding: .utf8)
                try "old setup".write(to: existing.appendingPathComponent("setup/README.md"), atomically: true, encoding: .utf8)
                controller.check()
            } else if scenario == "folder" { controller.check() }
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
        try expect(emptyController.summary == "Set up in ~/Zero", "fixed destination visible before action")
        try expect(try manager.contentsOfDirectory(atPath: deniedHome.path).isEmpty, "check leaves empty home unchanged")
        emptyController.primaryAction()
        try expect(emptyController.busy && !emptyController.mayExit(), "fresh placement gates shutdown")
        try pump(until: { !emptyController.busy })
        try expect(emptyController.stage == .ready && emptyController.selectedFolder?.lastPathComponent == "Zero", "primary creates fixed Zero and rechecks")
        try rejected("fresh default race never auto updates") {
            _ = try kit.place(parent: defaultHome, name: "Zero") {
                _ = try fixture(defaultHome.appendingPathComponent("Zero"))
                try "race owner".write(to: defaultHome.appendingPathComponent("Zero/starter/Main.java"), atomically: true, encoding: .utf8)
            }
        }
        try expect(try String(contentsOf: defaultHome.appendingPathComponent("Zero/starter/Main.java"), encoding: .utf8) == "race owner", "raced kit preserved until new confirmation")
        let existing = defaultHome.appendingPathComponent("Zero")
        let preserved = ["starter/Main.java", "starter/pom.xml", "starter/.vscode/tasks.json", "starter/.git/config", "starter/assets/art.png", "starter/saves/game.dat", "starter/src/main/java/zero/SimpleApp.java", "optional/Zero.code-profile", "optional/keybindings.json", "teacher-notes.txt", "zero-0.9.0.vsix"]
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
        try expect(defaultController.summary == "Set up in ~/Zero" && defaultController.stage == .chooseFolder, "existing fixed folder shown before confirmation")
        let beforeEntries = try manager.contentsOfDirectory(atPath: defaultHome.path)
        defaultController.primaryAction()
        try expect(defaultController.stage == .updateConsent && !defaultController.busy, "existing kit requires explicit confirmation")
        try expect(defaultController.consent?.detail == "Setup files will be replaced. Your code, assets and saved projects will be kept.", "overwrite confirmation explains preserved work")
        try expect(defaultFake.commands.count == 1 && defaultFake.commands[0].arguments[0].hasPrefix(kit.root.path), "no existing launcher executed before upgrade")
        defaultController.approve(false)
        try expect(defaultController.stage == .chooseFolder && defaultController.selectedFolder == nil, "cancel returns without selecting existing kit")
        try expect(try manager.contentsOfDirectory(atPath: defaultHome.path) == beforeEntries, "cancel creates no backup or staging")
        try expect(try String(contentsOf: existing.appendingPathComponent("setup/README.md"), encoding: .utf8) == "old launcher", "cancel changes no setup files")
        defaultController.primaryAction(); defaultController.approve(true)
        try expect(defaultController.busy && !defaultController.mayExit(), "update gates close")
        try pump(until: { !defaultController.busy })
        try expect(defaultController.stage == .ready && defaultController.selectedFolder == existing, "confirmed update rechecks fixed kit")
        try expect(defaultController.diagnostics.contains("Previous setup backup:"), "Details records permanent backup location")
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
            refused.check(); refused.primaryAction()
            try expect(refused.stage == .chooseFolder && refused.selectedFolder == nil && !refused.busy, "refuse unrelated \(kind)")
            try expect(try manager.contentsOfDirectory(atPath: badHome.path) == ["Zero"], "refusal writes nothing")
            try manager.removeItem(at: target)
        }
        let unavailable = SetupController(kit: kit, runner: FakeRunner(), home: parentLink)
        unavailable.check()
        try expect(unavailable.stage == .chooseFolder && unavailable.summary.contains("retry"), "unavailable default offers error details and retry")
        unavailable.primaryAction()
        try expect(!unavailable.busy && unavailable.selectedFolder == nil, "failed default never claims success or starts copying")
        try manager.removeItem(at: parentLink)
        try manager.createDirectory(at: parentLink, withIntermediateDirectories: false)
        unavailable.primaryAction()
        try pump(until: { !unavailable.busy })
        try expect(unavailable.stage == .ready && unavailable.selectedFolder?.lastPathComponent == "Zero", "retry uses default after home is repaired")
        let collisionController = SetupController(kit: kit, runner: FakeRunner(), home: defaultHome)
        collisionController.check()
        collisionController.place(parent: defaultHome, name: "Zero")
        try pump(until: { !collisionController.busy })
        try expect(collisionController.stage == .chooseFolder && collisionController.selectedFolder == nil, "failed placement returns to actionable folder stage")

        let fake = FakeRunner()
        let controller = SetupController(kit: kit, runner: fake, home: parent)
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
        fake.checkOutput = snapshot(["code": 0]); fake.plan = "manual"
        controller.check()
        try expect(controller.stage == .manualTool("code"), "missing Code uses explicit official download handoff")
        let beforeDownload = fake.commands.count
        controller.approve(true)
        try expect(fake.commands.count == beforeDownload, "manual tool state cannot install anything")
        controller.primaryAction()
        try expect(fake.commands.last == SetupCommand(executable: "/usr/bin/open", arguments: ["https://code.visualstudio.com/download"]) && controller.stage == .retry, "official browser handoff requires explicit action")
        fake.checkOutput = snapshot(["profile": 0, "zero": 0, "redhat": 0]); controller.check()
        try expect(controller.stage == .profileConsent, "profile preparation waits until tools verified")
        let beforeProfile = fake.commands.count
        controller.approve(false)
        try expect(controller.stage == .profileConsent && fake.commands.count == beforeProfile, "cancelled profile never opens editor")
        controller.approve(true)
        try expect(controller.stage == .profileStep(.commandPalette), "explicit open starts visible manual import guide")
        try expect(fake.commands.last?.arguments.last == "--native-profile", "profile opener scoped to supported backend")
        let wizardCommandCount = fake.commands.count
        var visibleSteps = [controller.summary]
        controller.primaryAction()
        try expect(controller.stage == .profileStep(.importMenu), "wizard next reaches native import menu instructions")
        visibleSteps.append(controller.summary)
        controller.primaryAction()
        try expect(controller.stage == .profileStep(.filePicker) && controller.primaryTitle == "Copy profile path", "wizard next explains Go to Folder before copying")
        visibleSteps.append(controller.summary)
        var copiedPath: String?
        controller.primaryAction()
        try expect(controller.stage == .profileStep(.filePicker), "generic Next cannot silently copy clipboard")
        controller.copyProfilePath { copiedPath = $0; return false }
        try expect(controller.stage == .profileStep(.filePicker), "failed copy stays on copy step")
        controller.copyProfilePath { copiedPath = $0; return true }
        try expect(copiedPath == copied.appendingPathComponent("optional/Zero.code-profile").path && controller.stage == .profileStep(.pastePath), "explicit copy uses exact kit profile path")
        visibleSteps.append(controller.summary)
        controller.primaryAction()
        try expect(controller.stage == .profileStep(.create) && controller.primaryTitle == "Check profile", "last guide step names Create and Zero")
        visibleSteps.append(controller.summary)
        try expect(visibleSteps == ["Press ⌘⇧P; open Preferences: Open Profiles (UI).", "New Profile menu → Import Profile → Select File.", "Press ⌘⇧G in the file picker.", "Paste the path; press Return, then Open.", "Click Create; keep the profile name Zero."], "essential supported import instructions are visible in exact order")
        for message in visibleSteps {
            try expect(message.count < 60 && !message.contains("\n"), "each import instruction stays one short line")
            let width = NSAttributedString(string: message, attributes: [.font: NSFont.systemFont(ofSize: 14)]).size().width
            try expect(width <= 400, "each import instruction fits the default status width")
        }
        try expect(fake.commands.count == wizardCommandCount, "guide steps never claim import or run tools")
        try expect(controller.canGoBack, "wizard can recover an omitted step")
        controller.previousProfileStep()
        try expect(controller.stage == .profileStep(.pastePath), "Back returns one guide step")
        controller.primaryAction(); controller.primaryAction()
        try expect(controller.stage == .profileStep(.create) && controller.summary.contains("not found"), "unfinished actual profile check stays unready without reopening editor")
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

        fake.plan = "manual"; fake.checkOutput = snapshot(["code": 0]); controller.check()
        try expect(controller.stage == .manualTool("code"), "manual plan remains a useful state")
        try expect(!fake.commands.contains { $0.arguments.contains("--native-install") }, "native controller never requests background system installation")
        let incompleteFake = FakeRunner()
        incompleteFake.result = CommandResult(exitCode: 0, output: snapshot(["kit": 0]), timedOut: false, launchError: nil)
        let incomplete = SetupController(kit: kit, runner: incompleteFake, home: parent)
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
        try expect(pausedWindow.windowShouldClose(pausedWindow.window!) && delegate.applicationShouldTerminate(app) == .terminateNow, "close and quit allowed after check finishes")
        pausedController.place(parent: parent, name: "Paused copy")
        try expect(locationButton == nil, "no location button during placement")
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
            let previewController = SetupController(kit: kit, runner: FakeRunner(), home: parent)
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
