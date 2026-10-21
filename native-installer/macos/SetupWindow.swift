import AppKit

final class SetupApplication: NSObject, NSApplicationDelegate {
    var setupWindow: SetupWindow?
    // Test harnesses can observe a successful editor handoff without an updater.
    var handOff: (() -> Void)?
    private(set) var updateCoordinator: UpdateCoordinator?
    private var explicitRequestReceived = false
    private var finishedLaunching = false
    private var pendingRequest: NativeUpdateRequest?
    private var handedOff = false
    private let updateOnlyLaunch: Bool
    #if ZERO_SETUP_TESTS
    var launchForTesting: (() -> Void)?
    var handleRequestForTesting: ((NativeUpdateRequest) -> Void)?
    #endif
    init(arguments: [String] = CommandLine.arguments) {
        updateOnlyLaunch = arguments.contains("--update-request")
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        finishedLaunching = true
        // LaunchServices may deliver the initial URL before or just after this callback.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let request = self.pendingRequest { self.pendingRequest = nil; self.handle(request); return }
            guard !self.explicitRequestReceived else { return }
            if self.updateOnlyLaunch {
                // No URL was delivered yet. Never fall through into kit preparation.
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
                    guard let self, !self.explicitRequestReceived else { return }
                    NSApp.terminate(nil)
                }
                return
            }
            #if ZERO_UPDATER_FIXTURE
            if Bundle.main.bundleIdentifier == "ca.codepet.zero.update-test",
               UpdateConfiguration().eligible,
               Bundle.main.object(forInfoDictionaryKey: "ZeroUpdaterFixtureHandoff") as? Bool == true {
                // The receipt lives beside this invocation's isolated installed app,
                // outside its signed bundle. Sparkle relaunches without test arguments.
                let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"
                let receipt: [String: Any] = ["schema": 1, "build": build, "pid": ProcessInfo.processInfo.processIdentifier,
                                             "ordinaryColdLaunch": !self.updateOnlyLaunch && !CommandLine.arguments.contains("--updater-fixture-handoff")]
                do {
                    let data = try JSONSerialization.data(withJSONObject: receipt, options: [.sortedKeys])
                    let destination = Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("handoff-\(build).json")
                    try data.write(to: destination, options: .atomic)
                } catch {
                    fputs("Could not record isolated updater handoff.\n", stderr)
                    NSApp.terminate(nil); return
                }
                self.completeHandoff(); return
            }
            #endif
            self.startOrdinaryLaunch()
        }
    }
    private func startOrdinaryLaunch() {
        #if ZERO_SETUP_TESTS
        if let launchForTesting { launchForTesting(); return }
        #endif
        guard updateCoordinator?.beginLaunching() != false else { return }
        let resources = Bundle.main.resourceURL ?? Bundle.main.bundleURL.appendingPathComponent("Contents/Resources")
        start(SetupController(kit: SetupKit(root: resources.appendingPathComponent("kit"))))
    }
    func start(_ controller: SetupController) {
        handedOff = false
        controller.mayBeginWork = { [weak self] in self?.updateCoordinator?.mayContinueSetup ?? true }
        setupWindow = SetupWindow(controller: controller)
        setupWindow?.closed = { [weak self] in self?.updateCoordinator?.setupClosed() }
        controller.opened = { [weak self] in self?.completeHandoff() }
        setupWindow?.showWindow(nil)
        controller.launch()
        NSApp.setActivationPolicy(.regular); NSApp.activate(ignoringOtherApps: true)
    }
    private func completeHandoff() {
        handedOff = true
        if let handOff { handOff(); return }
        setupWindow?.window?.orderOut(nil)
        guard UpdateConfiguration().eligible else { NSApp.terminate(nil); return }
        ensureUpdater()
        if updateCoordinator?.requiresForeground != true { NSApp.setActivationPolicy(.accessory) }
        updateCoordinator?.handedOff()
    }
    private func ensureUpdater() {
        guard updateCoordinator == nil else { return }
        updateCoordinator = UpdateCoordinator(helperActive: { [weak self] in self?.setupWindow?.controller.busy ?? false }, terminate: { NSApp.terminate(nil) })
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        // Reject a mixed or multi-command event in its entirety.
        guard urls.count == 1, let request = NativeUpdateRequest(url: urls[0]) else { return }
        explicitRequestReceived = true
        if !finishedLaunching { pendingRequest = request }
        else { handle(request) }
    }
    private func handle(_ request: NativeUpdateRequest) {
        #if ZERO_SETUP_TESTS
        if let handleRequestForTesting { handleRequestForTesting(request); return }
        #endif
        guard UpdateConfiguration().eligible else {
            let alert = NSAlert(); alert.messageText = "Updates are unavailable in this build."
            alert.informativeText = "Install the current signed Zero download to enable updates."
            alert.runModal()
            if setupWindow == nil { NSApp.terminate(nil) }
            return
        }
        ensureUpdater()
        updateCoordinator?.request(request)
    }
    @objc func checkForUpdates(_ sender: Any?) { explicitRequestReceived = true; handle(.check) }
    @objc func showUpdateSettings(_ sender: Any?) { explicitRequestReceived = true; handle(.settings) }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if handedOff {
            startOrdinaryLaunch()
        } else if setupWindow != nil {
            setupWindow?.showWindow(nil); sender.activate(ignoringOtherApps: true)
        }
        return false
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { updateCoordinator == nil }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard setupWindow?.controller.mayExit() != false else {
            updateCoordinator?.deferTerminationForHelper()
            return .terminateCancel
        }
        return updateCoordinator?.mayTerminate() == false ? .terminateCancel : .terminateNow
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
    var closed: (() -> Void)?

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
    func windowWillClose(_ notification: Notification) { closed?() }
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
