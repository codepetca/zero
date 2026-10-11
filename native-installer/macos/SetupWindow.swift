import AppKit

final class SetupApplication: NSObject, NSApplicationDelegate {
    var setupWindow: SetupWindow?
    func applicationDidFinishLaunching(_ notification: Notification) {
        let resources = Bundle.main.resourceURL ?? Bundle.main.bundleURL.appendingPathComponent("Contents/Resources")
        let controller = SetupController(kit: SetupKit(root: resources.appendingPathComponent("kit")))
        setupWindow = SetupWindow(controller: controller)
        setupWindow?.showWindow(nil)
        controller.check()
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        setupWindow?.controller.mayExit() == false ? .terminateCancel : .terminateNow
    }
}

struct SetupBuildLabel {
    let development: Bool
    let version: String
    init(info: [String: Any] = Bundle.main.infoDictionary ?? [:]) {
        development = info["ZeroDevelopmentBuild"] as? Bool ?? true
        version = info["CFBundleShortVersionString"] as? String ?? ""
    }
    var windowTitle: String { development ? "Zero Setup — unsigned development build" : "Zero Setup" }
    var detail: String { development ? "Unsigned development build · local testing only" : "Zero Setup \(version)" }
}

final class SetupWindow: NSWindowController, NSWindowDelegate {
    let controller: SetupController
    private let status = NSTextField(labelWithString: "")
    private let spinner = NSProgressIndicator()
    private let primary = NSButton(title: "Please wait", target: nil, action: nil)
    private let details = NSButton(title: "Details…", target: nil, action: nil)
    private var diagnosticsWindow: NSWindowController?

    init(controller: SetupController) {
        self.controller = controller
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 440, height: 180),
                              styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = SetupBuildLabel().windowTitle
        super.init(window: window)
        window.delegate = self; window.center()
        let root = NSView(frame: NSRect(x: 0, y: 0, width: 440, height: 180))
        window.contentView = root
        status.font = .systemFont(ofSize: 14)
        status.alignment = .center
        status.maximumNumberOfLines = 1
        status.lineBreakMode = .byTruncatingTail
        status.setAccessibilityLabel("Setup status")
        spinner.style = .spinning; spinner.controlSize = .small
        spinner.isDisplayedWhenStopped = false
        for view in [status, spinner, primary, details] { view.translatesAutoresizingMaskIntoConstraints = false; root.addSubview(view) }
        primary.bezelStyle = .rounded; primary.target = self; primary.action = #selector(primaryAction)
        details.bezelStyle = .rounded; details.target = self; details.action = #selector(showDetails)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: root.centerXAnchor),
            spinner.topAnchor.constraint(equalTo: root.topAnchor, constant: 25),
            spinner.widthAnchor.constraint(equalToConstant: 18), spinner.heightAnchor.constraint(equalToConstant: 18),
            status.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 16),
            status.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 20),
            status.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -20),
            status.heightAnchor.constraint(equalToConstant: 22),
            primary.topAnchor.constraint(equalTo: status.bottomAnchor, constant: 18),
            primary.centerXAnchor.constraint(equalTo: root.centerXAnchor),
            details.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            details.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -10)
        ])
        controller.changed = { [weak self] in self?.refresh() }
        refresh()
    }
    required init?(coder: NSCoder) { fatalError("Use init(controller:)") }
    func windowShouldClose(_ sender: NSWindow) -> Bool { controller.mayExit() }
    func refresh() {
        status.stringValue = controller.summary
        primary.title = controller.primaryTitle; primary.isEnabled = !controller.busy
        if controller.busy { spinner.startAnimation(nil) } else { spinner.stopAnimation(nil) }
    }
    @objc private func primaryAction() {
        guard !controller.busy, window != nil else { return }
        if controller.stage == .chooseFolder { chooseFolder(); return }
        if controller.consent != nil {
            let profileHandoff = controller.stage == .profileConsent
            controller.approve(true)
            if profileHandoff { NSWorkspace.shared.activateFileViewerSelecting([controller.profileFile]) }
        } else { controller.primaryAction() }
    }

    private func chooseFolder() {
        guard let window else { return }
        let picker = NSOpenPanel()
        picker.title = "Choose where to place your new Zero folder"
        picker.message = "Your kit goes into a fresh folder here. Existing projects are preserved."
        picker.prompt = "Choose folder"
        picker.canChooseDirectories = true; picker.canChooseFiles = false
        picker.allowsMultipleSelection = false; picker.canCreateDirectories = true
        picker.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let self, let parent = picker.url else { return }
            let alert = NSAlert()
            alert.messageText = "Name your new Zero folder"
            alert.informativeText = "Existing folders and projects are always preserved."
            alert.addButton(withTitle: "Set up Zero"); alert.addButton(withTitle: "Cancel")
            let name = NSTextField(string: "Zero")
            name.frame = NSRect(x: 0, y: 0, width: 300, height: 24)
            name.setAccessibilityLabel("New Zero folder name")
            alert.accessoryView = name; alert.window.initialFirstResponder = name
            alert.beginSheetModal(for: window) { response in
                if response == .alertFirstButtonReturn { self.controller.place(parent: parent, name: name.stringValue) }
            }
        }
    }
    @objc private func showDetails() {
        let detailWindow = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 700, height: 460),
                                    styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        detailWindow.title = "Zero Setup Details"
        let text = NSTextView()
        text.isEditable = false; text.isSelectable = true
        text.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        text.textContainerInset = NSSize(width: 12, height: 12)
        text.isHorizontallyResizable = false; text.isVerticallyResizable = true
        text.autoresizingMask = [.width]; text.textContainer?.widthTracksTextView = true
        text.string = "\(controller.summary)\n\n\(controller.consent?.detail ?? "")\n\nProfile import: Command Palette > Preferences: Open Profiles (UI) > menu beside New Profile > Import Profile… > Select File…. Select \(controller.profileFile.path) and Create a profile named Zero. Return here and Continue.\n\n\(controller.diagnostics)\nGuide: \((controller.selectedFolder ?? controller.kit.root).appendingPathComponent("START-HERE.md").path)"
        let scroll = NSScrollView(frame: detailWindow.contentLayoutRect)
        scroll.autoresizingMask = [.width, .height]
        scroll.hasVerticalScroller = true; scroll.documentView = text
        detailWindow.contentView = scroll
        diagnosticsWindow = NSWindowController(window: detailWindow)
        detailWindow.center(); diagnosticsWindow?.showWindow(nil)
    }
}
