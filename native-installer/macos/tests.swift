import AppKit
import Foundation

#if ZERO_SETUP_TESTS
private final class FakeRunner: SetupCommandRunning {
    var commands: [SetupCommand] = []
    var timeouts: [TimeInterval] = []
    var result = CommandResult(exitCode: 0, output: "Zero setup check (profile: Zero)\nKit: complete\nVS Code: compatible\nJDK: ready\nZero profile extensions: ready\nGit: optional", timedOut: false, launchError: nil)
    func run(_ command: SetupCommand, timeout: TimeInterval, completion: @escaping (CommandResult) -> Void) {
        commands.append(command); timeouts.append(timeout); completion(result)
    }
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
        let temporary = manager.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("Zero native tests \(UUID().uuidString)")
        try manager.createDirectory(at: temporary, withIntermediateDirectories: true)
        defer { try? manager.removeItem(at: temporary) }
        let kit = try fixture(temporary.appendingPathComponent("bundled kit $x; 'quotes'"))
        try kit.validate()
        let parent = temporary.appendingPathComponent("student files $x; 'quotes'")
        try manager.createDirectory(at: parent, withIntermediateDirectories: true)
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
        try expect(fake.commands.isEmpty, "opening controller executes nothing")
        controller.place(parent: nil, name: nil)
        try expect(fake.commands.isEmpty && controller.selectedFolder == nil && !controller.busy, "cancelled selection executes nothing")
        controller.continueSetup()
        try expect(fake.commands.isEmpty, "continuation requires an explicit copied folder")
        controller.check()
        try expect(fake.commands == [SetupCommand(executable: "/bin/bash", arguments: [kit.root.appendingPathComponent("setup/setup.sh").path, "--check"])], "check uses fixed argv with metacharacter paths")
        try expect(fake.timeouts == [180], "check has outer timeout")
        try expect(controller.summary.contains("reports ready"), "zero exit reports checker readiness")
        fake.result = CommandResult(exitCode: 1, output: "JDK: missing", timedOut: false, launchError: nil)
        controller.check()
        try expect(controller.summary.contains("needs attention") && !controller.summary.contains("reports ready"), "nonzero check truthful")
        fake.result = CommandResult(exitCode: 0, output: "partial check", timedOut: true, launchError: nil)
        controller.check()
        try expect(controller.summary.contains("timed out") && !controller.summary.contains("reports ready"), "timeout overrides zero exit")
        fake.result = CommandResult(exitCode: nil, output: "", timedOut: false, launchError: "denied")
        controller.check()
        try expect(controller.summary.contains("could not finish") && controller.summary.contains("unverified"), "spawn failure truthful")
        controller.place(parent: parent, name: "Controller kit ; $x")
        try pump(until: { !controller.busy })
        try expect(controller.selectedFolder != nil && fake.commands.count == 4, "placing kit launches no installer")
        fake.result = CommandResult(exitCode: 0, output: "", timedOut: false, launchError: nil)
        controller.continueSetup()
        try expect(fake.commands.last == SetupCommand(executable: "/usr/bin/open", arguments: ["-a", "Terminal", controller.selectedFolder!.appendingPathComponent("setup/Setup.command").path]), "Terminal uses separate argv")
        try expect(controller.summary.contains("does not confirm"), "open success is not installation success")

        // Exercise the real runner only against disposable scripts, never tools.
        let fakeScript = temporary.appendingPathComponent("fake script ; $x.sh")
        try "#!/bin/bash\nprintf 'captured output\\n'\nexit 7\n".write(to: fakeScript, atomically: true, encoding: .utf8)
        var actual: CommandResult?
        let runner = NativeCommandRunner()
        runner.run(SetupCommand(executable: "/bin/bash", arguments: [fakeScript.path]), timeout: 2) { actual = $0 }
        try pump(until: { actual != nil })
        try expect(actual!.exitCode == 7 && actual!.output.contains("captured output") && !actual!.succeeded, "real runner captures failure")
        try "#!/bin/bash\nsleep 30 &\nwait\n".write(to: fakeScript, atomically: true, encoding: .utf8)
        actual = nil
        runner.run(SetupCommand(executable: "/bin/bash", arguments: [fakeScript.path]), timeout: 0.1) { actual = $0 }
        try pump(until: { actual != nil })
        try expect(actual!.timedOut && !actual!.succeeded, "real runner times out descendants")
        actual = nil
        runner.run(SetupCommand(executable: "/no/such/executable", arguments: []), timeout: 1) { actual = $0 }
        try pump(until: { actual != nil })
        try expect(actual!.launchError != nil && !actual!.succeeded, "real spawn failure captured")
        print("Mac native setup: \(passed) assertions passed (disposable files/fake tools; no installs, Terminal or accounts).")

        if let option = CommandLine.arguments.firstIndex(of: "--preview"), option + 1 < CommandLine.arguments.count {
            let app = NSApplication.shared
            app.setActivationPolicy(.prohibited)
            let previewController = SetupController(kit: kit, runner: FakeRunner())
            previewController.check()
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
