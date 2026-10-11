import AppKit

final class SetupApplication: NSObject, NSApplicationDelegate {
    var setupWindow: SetupWindow?
    func applicationDidFinishLaunching(_ notification: Notification) {
        let resources = Bundle.main.resourceURL ?? Bundle.main.bundleURL.appendingPathComponent("Contents/Resources")
        let controller = SetupController(kit: SetupKit(root: resources.appendingPathComponent("kit")))
        setupWindow = SetupWindow(controller: controller)
        setupWindow?.showWindow(nil)
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
    private let summary = NSTextView()
    private let checkButton = NSButton(title: "Check laptop", target: nil, action: nil)
    private let setupButton = NSButton(title: "Set up Zero…", target: nil, action: nil)
    private let continueButton = NSButton(title: "Continue setup", target: nil, action: nil)
    private let folderButton = NSButton(title: "Open folder", target: nil, action: nil)
    private let guideButton = NSButton(title: "Show guide", target: nil, action: nil)

    init(controller: SetupController) {
        self.controller = controller
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 760, height: 550),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        let build = SetupBuildLabel()
        window.title = build.windowTitle
        window.minSize = NSSize(width: 630, height: 430)
        super.init(window: window)
        window.delegate = self
        window.center()
        let root = NSView()
        root.translatesAutoresizingMaskIntoConstraints = false
        window.contentView = root
        let title = NSTextField(labelWithString: "Zero Setup")
        title.font = .systemFont(ofSize: 28, weight: .semibold)
        let subtitle = NSTextField(labelWithString: "Check this laptop, then choose a fresh folder for your Java kit.")
        subtitle.font = .systemFont(ofSize: 14)
        let development = NSTextField(labelWithString: build.detail)
        development.textColor = .secondaryLabelColor
        development.font = .systemFont(ofSize: 12)

        summary.isEditable = false
        summary.isSelectable = true
        summary.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        summary.textContainerInset = NSSize(width: 12, height: 12)
        summary.autoresizingMask = [.width]
        summary.isHorizontallyResizable = false
        summary.isVerticallyResizable = true
        summary.textContainer?.widthTracksTextView = true
        summary.setAccessibilityLabel("Read-only setup check summary")
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        scroll.documentView = summary
        scroll.translatesAutoresizingMaskIntoConstraints = false

        configure(checkButton, action: #selector(checkLaptop))
        configure(setupButton, action: #selector(setupZero))
        configure(continueButton, action: #selector(continueSetup))
        configure(folderButton, action: #selector(openFolder))
        configure(guideButton, action: #selector(showGuide))
        let buttons = NSStackView(views: [checkButton, setupButton, guideButton])
        buttons.orientation = .horizontal; buttons.spacing = 10
        let continuation = NSStackView(views: [continueButton, folderButton])
        continuation.orientation = .horizontal; continuation.spacing = 10
        let header = NSStackView(views: [title, subtitle, development])
        header.orientation = .vertical; header.alignment = .leading; header.spacing = 6
        [header, buttons, continuation].forEach { $0.translatesAutoresizingMaskIntoConstraints = false }
        [header, scroll, buttons, continuation].forEach { root.addSubview($0) }
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: root.topAnchor, constant: 24),
            header.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
            header.trailingAnchor.constraint(lessThanOrEqualTo: root.trailingAnchor, constant: -24),
            scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 20),
            scroll.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
            scroll.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -24),
            scroll.bottomAnchor.constraint(equalTo: buttons.topAnchor, constant: -18),
            buttons.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
            buttons.trailingAnchor.constraint(lessThanOrEqualTo: root.trailingAnchor, constant: -24),
            buttons.bottomAnchor.constraint(equalTo: continuation.topAnchor, constant: -12),
            continuation.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
            continuation.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -24)
        ])
        controller.changed = { [weak self] in self?.refresh() }
        refresh()
    }

    required init?(coder: NSCoder) { fatalError("Use init(controller:)") }

    func windowShouldClose(_ sender: NSWindow) -> Bool { controller.mayExit() }

    private func configure(_ button: NSButton, action: Selector) {
        button.bezelStyle = .rounded
        button.target = self
        button.action = action
    }

    func refresh() {
        summary.string = controller.summary
        checkButton.title = controller.hasChecked ? "Check again" : "Check laptop"
        checkButton.isEnabled = !controller.busy
        setupButton.isEnabled = !controller.busy
        guideButton.isEnabled = !controller.busy
        continueButton.isEnabled = !controller.busy && controller.selectedFolder != nil
        folderButton.isEnabled = !controller.busy && controller.selectedFolder != nil
    }

    @objc private func checkLaptop() { controller.check() }

    @objc private func setupZero() {
        guard let window else { return }
        let picker = NSOpenPanel()
        picker.title = "Choose where to place your new Zero folder"
        picker.message = "Choose a writable parent folder. The complete kit goes into a fresh folder inside it."
        picker.prompt = "Choose folder"
        picker.canChooseDirectories = true; picker.canChooseFiles = false
        picker.allowsMultipleSelection = false; picker.canCreateDirectories = true
        picker.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let self, let parent = picker.url else { return }
            let alert = NSAlert()
            alert.messageText = "Name your new Zero folder"
            alert.informativeText = "Existing folders and projects are always preserved."
            alert.addButton(withTitle: "Place kit"); alert.addButton(withTitle: "Cancel")
            let name = NSTextField(string: "Zero")
            name.frame = NSRect(x: 0, y: 0, width: 340, height: 24)
            name.setAccessibilityLabel("New Zero folder name")
            alert.accessoryView = name
            alert.window.initialFirstResponder = name
            alert.beginSheetModal(for: window) { response in
                if response == .alertFirstButtonReturn { self.controller.place(parent: parent, name: name.stringValue) }
            }
        }
    }

    @objc private func continueSetup() { controller.continueSetup() }
    @objc private func openFolder() {
        guard let folder = controller.selectedFolder else { return }
        NSWorkspace.shared.activateFileViewerSelecting([folder])
    }
    @objc private func showGuide() {
        let guide = (controller.selectedFolder ?? controller.kit.root).appendingPathComponent("START-HERE.md")
        if !NSWorkspace.shared.open(guide) {
            let alert = NSAlert()
            alert.messageText = "Could not open the guide"
            alert.informativeText = "Open this file manually:\n\(guide.path)"
            alert.runModal()
        }
    }
}
