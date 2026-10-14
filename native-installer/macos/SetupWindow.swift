import AppKit

final class SetupApplication: NSObject, NSApplicationDelegate {
    var setupWindow: SetupWindow?
    var handOff: () -> Void = { NSApp.terminate(nil) }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let resources = Bundle.main.resourceURL ?? Bundle.main.bundleURL.appendingPathComponent("Contents/Resources")
        let controller = SetupController(kit: SetupKit(root: resources.appendingPathComponent("kit")))
        start(controller)
    }
    func start(_ controller: SetupController) {
        setupWindow = SetupWindow(controller: controller)
        controller.opened = { [weak self] in self?.handOff() }
        setupWindow?.showWindow(nil)
        controller.launch()
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        setupWindow?.showWindow(nil)
        sender.activate(ignoringOtherApps: true)
        return true
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
    var windowTitle: String { development ? "Zero — unsigned development build" : "Zero" }
    var detail: String { development ? "Unsigned development build · local testing only" : "Zero \(version)" }
}

final class SetupWindow: NSWindowController, NSWindowDelegate {
    let controller: SetupController
    private let status = NSTextField(labelWithString: "")
    private let progress = NSProgressIndicator()
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
        progress.style = .bar; progress.controlSize = .small
        progress.isIndeterminate = false
        progress.minValue = 0; progress.maxValue = Double(SetupController.totalSteps)
        progress.isDisplayedWhenStopped = true
        progress.setAccessibilityLabel("Preparation progress")
        let content = NSStackView(views: [status, progress, primary])
        content.orientation = .vertical
        content.alignment = .centerX
        content.spacing = 16
        content.detachesHiddenViews = true
        for view in [content, details] { view.translatesAutoresizingMaskIntoConstraints = false; root.addSubview(view) }
        for view in [status, progress, primary] { view.translatesAutoresizingMaskIntoConstraints = false }
        primary.bezelStyle = .rounded; primary.target = self; primary.action = #selector(primaryAction)
        details.bezelStyle = .rounded; details.target = self; details.action = #selector(showDetails)
        NSLayoutConstraint.activate([
            content.centerXAnchor.constraint(equalTo: root.centerXAnchor),
            content.centerYAnchor.constraint(equalTo: root.centerYAnchor),
            content.widthAnchor.constraint(equalTo: root.widthAnchor, constant: -40),
            status.widthAnchor.constraint(equalTo: content.widthAnchor),
            status.heightAnchor.constraint(equalToConstant: 22),
            progress.widthAnchor.constraint(equalTo: content.widthAnchor, constant: -80),
            progress.heightAnchor.constraint(equalToConstant: 8),
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
        primary.isHidden = controller.busy || controller.stage == .checking
        details.isHidden = controller.busy || controller.stage != .retry
        progress.isHidden = !controller.busy && controller.stage != .checking && controller.stage != .ready && controller.stage != .opened
        let opening = controller.busy && controller.completedSteps == SetupController.totalSteps
        if progress.isIndeterminate != opening {
            progress.stopAnimation(nil)
            progress.isIndeterminate = opening
        }
        if opening { progress.startAnimation(nil) }
        else { progress.doubleValue = Double(controller.completedSteps) }
    }
    @objc private func primaryAction() {
        guard !controller.busy, window != nil else { return }
        controller.primaryAction()
    }

    @objc private func showDetails() {
        let detailWindow = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 700, height: 460),
                                    styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        detailWindow.title = "Zero Details"
        let text = NSTextView()
        text.isEditable = false; text.isSelectable = true
        text.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        text.textContainerInset = NSSize(width: 12, height: 12)
        text.isHorizontallyResizable = false; text.isVerticallyResizable = true
        text.autoresizingMask = [.width]; text.textContainer?.widthTracksTextView = true
        text.string = "\(controller.summary)\n\n\(controller.diagnostics)\nGuide: \((controller.selectedFolder ?? controller.kit.root).appendingPathComponent("START-HERE.md").path)"
        let scroll = NSScrollView(frame: detailWindow.contentLayoutRect)
        scroll.autoresizingMask = [.width, .height]
        scroll.hasVerticalScroller = true; scroll.documentView = text
        detailWindow.contentView = scroll
        diagnosticsWindow = NSWindowController(window: detailWindow)
        detailWindow.center(); diagnosticsWindow?.showWindow(nil)
    }
}
