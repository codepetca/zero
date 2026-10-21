import AppKit
import Sparkle

/// Requests intentionally carry no arguments, feeds, paths or installation targets.
enum NativeUpdateRequest: String {
    case check = "zero-updates://check"
    case settings = "zero-updates://settings"
    init?(url: URL) { self.init(rawValue: url.absoluteString) }
}

struct UpdateConfiguration {
    let eligible: Bool
    init(info: [String: Any] = Bundle.main.infoDictionary ?? [:]) {
        let identity = info["CFBundleIdentifier"] as? String
        let feed = info["SUFeedURL"] as? String
        var validHost = identity == "ca.codepet.zero" && feed == "https://zero.codepet.ca/updates/macos/appcast.xml"
        #if ZERO_UPDATER_FIXTURE
        if identity == "ca.codepet.zero.update-test", let feed, let url = URLComponents(string: feed) {
            validHost = url.scheme == "http" && url.host == "127.0.0.1" && url.port != nil && url.user == nil && url.password == nil && url.query == nil && url.fragment == nil
        }
        #endif
        let key = (info["SUPublicEDKey"] as? String).flatMap { Data(base64Encoded: $0) }
        eligible = validHost && info["ZeroDevelopmentBuild"] as? Bool == false && key?.count == 32
    }
}

/// Main-thread policy shared by the real Sparkle adapter and deterministic tests.
/// An update session can finish before installation does; those states must differ.
struct UpdateLifecycle {
    static let unattendedBudget: TimeInterval = 120
    private(set) var deadline: TimeInterval?
    var launching = false
    var manualCheck = false
    var settingsVisible = false
    var updateUI = false
    var modalUI = false
    var cycleFinished = false
    var installOnQuit = false
    var installationCommitted = false
    var terminationDeferred = false
    private(set) var terminationCommitted = false

    var mayBeginSetup: Bool { !installationCommitted && !terminationCommitted }
    // Finish the launch already in progress before committing Sparkle's relaunch.
    var mayContinueSetup: Bool { !terminationCommitted && (!installationCommitted || launching) }
    func mayResumeRelaunch(helperActive: Bool) -> Bool {
        !helperActive && !launching && !modalUI && !terminationCommitted
    }
    static func checkIsDue(enabled: Bool, lastCheck: Date?, interval: TimeInterval, now: Date) -> Bool {
        enabled && (lastCheck.map { now.timeIntervalSince($0) >= max(0, interval) } ?? true)
    }
    mutating func handedOff(now: TimeInterval) {
        launching = false
        // Reopening the editor does not extend a background download indefinitely.
        if deadline == nil { deadline = now + Self.unattendedBudget }
    }
    func shouldTerminate(now: TimeInterval, helperActive: Bool) -> Bool {
        guard !helperActive, !launching, !terminationCommitted, !modalUI else { return false }
        // Sparkle may retry termination after an already committed installation
        // was temporarily blocked by a helper.
        if terminationDeferred { return true }
        guard !settingsVisible, !updateUI else { return false }
        if installationCommitted { return false }
        if installOnQuit { return true }
        if manualCheck { return cycleFinished }
        return cycleFinished || deadline.map { now >= $0 } == true
    }
    mutating func commitTermination(helperActive: Bool) -> Bool {
        guard !helperActive else { return false }
        terminationCommitted = true
        return true
    }
}

/// Retains Sparkle's continuation only while existing setup work must finish.
/// Taking it before invoking prevents duplicate timer callbacks from restarting it.
struct UpdateRelaunchContinuation {
    private var pending: (() -> Void)?
    mutating func postpone(until handler: @escaping () -> Void, lifecycle: UpdateLifecycle, helperActive: Bool) -> Bool {
        guard !lifecycle.mayResumeRelaunch(helperActive: helperActive) else { return false }
        pending = handler
        return true
    }
    mutating func takeIfReady(lifecycle: UpdateLifecycle, helperActive: Bool) -> (() -> Void)? {
        guard lifecycle.mayResumeRelaunch(helperActive: helperActive) else { return nil }
        let handler = pending
        pending = nil
        return handler
    }
    mutating func cancel() { pending = nil }
}

/// Sparkle owns and persists these preferences. Zero writes them only on a click.
protocol UpdatePreferences: AnyObject {
    var automaticallyChecksForUpdates: Bool { get set }
    var automaticallyDownloadsUpdates: Bool { get set }
    var allowsAutomaticUpdates: Bool { get }
}
extension SPUUpdater: UpdatePreferences {}

final class UpdateSettingsWindow: NSWindowController, NSWindowDelegate {
    private let preferences: UpdatePreferences
    private let checks = NSButton(checkboxWithTitle: "Check for updates automatically", target: nil, action: nil)
    private let downloads = NSButton(checkboxWithTitle: "Download and install updates automatically", target: nil, action: nil)
    var closed: (() -> Void)?
    init(preferences: UpdatePreferences) {
        self.preferences = preferences
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 150), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Zero Update Settings"
        super.init(window: window)
        window.delegate = self
        let stack = NSStackView(views: [checks, downloads])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView?.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 24), stack.centerYAnchor.constraint(equalTo: window.contentView!.centerYAnchor)])
        checks.target = self; checks.action = #selector(changeChecks)
        downloads.target = self; downloads.action = #selector(changeDownloads)
        refresh(); window.center()
    }
    required init?(coder: NSCoder) { fatalError("Use init(preferences:)") }
    func refresh() {
        checks.state = preferences.automaticallyChecksForUpdates ? .on : .off
        downloads.state = preferences.automaticallyDownloadsUpdates ? .on : .off
        downloads.isEnabled = preferences.allowsAutomaticUpdates
    }
    @objc private func changeChecks() { preferences.automaticallyChecksForUpdates = checks.state == .on; refresh() }
    @objc private func changeDownloads() { preferences.automaticallyDownloadsUpdates = downloads.state == .on; refresh() }
    func windowWillClose(_ notification: Notification) { closed?() }
}

/// Strongly owned by SetupApplication, on AppKit's main thread only.
final class UpdateCoordinator: NSObject, SPUUpdaterDelegate, SPUStandardUserDriverDelegate {
    private(set) var lifecycle = UpdateLifecycle()
    private var standardController: SPUStandardUpdaterController!
    private var timer: Timer?
    private var settingsWindow: UpdateSettingsWindow?
    private let helperActive: () -> Bool
    private let terminate: () -> Void
    private var terminationRequested = false
    private var started = false
    private var relaunchContinuation = UpdateRelaunchContinuation()


    init(helperActive: @escaping () -> Bool, terminate: @escaping () -> Void) {
        self.helperActive = helperActive; self.terminate = terminate
        super.init()
        standardController = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: self, userDriverDelegate: self)
    }
    deinit { timer?.invalidate() }
    var mayBeginSetup: Bool { lifecycle.mayBeginSetup && !terminationRequested }
    var mayContinueSetup: Bool { lifecycle.mayContinueSetup && !terminationRequested }
    var requiresForeground: Bool { lifecycle.manualCheck || lifecycle.settingsVisible || lifecycle.updateUI || lifecycle.modalUI }
    func beginLaunching() -> Bool {
        guard mayBeginSetup else { return false }
        lifecycle.launching = true
        return true
    }
    private func start() -> Bool {
        guard !started else { return true }
        do { try standardController.updater.start(); started = true; startTimer(); trace("started"); return true }
        catch {
            trace("start-error")
            let alert = NSAlert(error: error); alert.runModal()
            lifecycle.cycleFinished = true
            DispatchQueue.main.async { [weak self] in self?.tick() }
            return false
        }
    }
    func handedOff() {
        lifecycle.handedOff(now: ProcessInfo.processInfo.systemUptime)
        guard !started else { trace("repeat-handoff"); tick(); return }
        let updater = standardController.updater
        let due = UpdateLifecycle.checkIsDue(enabled: updater.automaticallyChecksForUpdates, lastCheck: updater.lastUpdateCheckDate, interval: updater.updateCheckInterval, now: Date())
        guard start() else { return }
        trace(due ? "handoff-due" : "handoff-not-due")
        if due { updater.checkForUpdatesInBackground() }
        else { lifecycle.cycleFinished = true; tick() }
    }
    func request(_ request: NativeUpdateRequest) {
        guard mayBeginSetup else { return }
        if request == .check {
            // A live automatic download cannot be converted to a second check.
            guard !started || standardController.updater.canCheckForUpdates else {
                let alert = NSAlert(); alert.messageText = "An update is already being prepared."
                alert.informativeText = "Try again shortly."; alert.runModal(); return
            }
            lifecycle.manualCheck = true; lifecycle.cycleFinished = false; lifecycle.updateUI = true
            guard start() else { lifecycle.updateUI = false; tick(); return }
            NSApp.setActivationPolicy(.regular); NSApp.activate(ignoringOtherApps: true)
            standardController.checkForUpdates(nil); trace("manual-check")
        } else {
            lifecycle.settingsVisible = true
            guard start() else { lifecycle.settingsVisible = false; tick(); return }
            if settingsWindow == nil {
                settingsWindow = UpdateSettingsWindow(preferences: standardController.updater)
                settingsWindow?.closed = { [weak self] in
                    guard let self else { return }
                    self.lifecycle.settingsVisible = false
                    if self.lifecycle.deadline == nil && !self.lifecycle.manualCheck { self.lifecycle.cycleFinished = true }
                    self.tick()
                }
            }
            settingsWindow?.refresh(); settingsWindow?.showWindow(nil)
            NSApp.setActivationPolicy(.regular); NSApp.activate(ignoringOtherApps: true); trace("settings")
        }
    }
    func setupClosed() { lifecycle.launching = false; tick() }
    func deferTerminationForHelper() {
        if lifecycle.installationCommitted { lifecycle.terminationDeferred = true }
    }
    func mayTerminate() -> Bool {
        let allowed = lifecycle.commitTermination(helperActive: helperActive())
        if allowed { timer?.invalidate(); trace("termination-committed") }
        return allowed
    }
    private func startTimer() {
        timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(timer!, forMode: .common)
    }
    private func tick() {
        if let resume = relaunchContinuation.takeIfReady(lifecycle: lifecycle, helperActive: helperActive()) {
            trace("relaunch-resumed")
            resume()
            return
        }
        guard !terminationRequested, lifecycle.shouldTerminate(now: ProcessInfo.processInfo.systemUptime, helperActive: helperActive()) else { return }
        terminationRequested = true
        trace(lifecycle.installOnQuit || lifecycle.terminationDeferred ? "quit-to-install" : "finished")
        terminate()
    }
    private func trace(_ event: String) {
        #if ZERO_UPDATER_FIXTURE
        if Bundle.main.bundleIdentifier == "ca.codepet.zero.update-test" {
            print("ZERO_UPDATER \(event)"); fflush(stdout)
        }
        #endif
    }
    func updater(_ updater: SPUUpdater, mayPerform updateCheck: SPUUpdateCheck) throws {
        guard !helperActive(), !lifecycle.launching, lifecycle.mayBeginSetup else { throw NSError(domain: "ca.codepet.zero.updates", code: 1, userInfo: [NSLocalizedDescriptionKey: "Please wait for Zero preparation to finish."]) }
    }
    // Sparkle 2.10 cancels installation if this returns false.
    func updaterShouldRelaunchApplication(_ updater: SPUUpdater) -> Bool { true }
    func updater(_ updater: SPUUpdater, shouldPostponeRelaunchForUpdate item: SUAppcastItem, untilInvokingBlock installHandler: @escaping () -> Void) -> Bool {
        lifecycle.installationCommitted = true
        let postponed = relaunchContinuation.postpone(until: installHandler, lifecycle: lifecycle, helperActive: helperActive())
        trace(postponed ? "relaunch-postponed" : "relaunch-ready")
        // Returning false lets Sparkle install and relaunch normally. When busy,
        // tick invokes Sparkle's continuation after the existing work finishes.
        return postponed
    }
    func allowedChannels(for updater: SPUUpdater) -> Set<String> { [] }
    func updater(_ updater: SPUUpdater, willInstallUpdateOnQuit item: SUAppcastItem, immediateInstallationBlock immediateInstallHandler: @escaping () -> Void) -> Bool {
        lifecycle.installOnQuit = true; trace("install-on-quit")
        // Sparkle installs on normal termination. Do not invoke its relaunching block.
        DispatchQueue.main.async { [weak self] in self?.tick() }
        return false
    }
    func updater(_ updater: SPUUpdater, willInstallUpdate item: SUAppcastItem) {
        lifecycle.installationCommitted = true; trace("installation-committed")
    }
    func updater(_ updater: SPUUpdater, didFinishUpdateCycleFor updateCheck: SPUUpdateCheck, error: Error?) {
        lifecycle.cycleFinished = true
        if error != nil {
            relaunchContinuation.cancel()
            lifecycle.installationCommitted = false; lifecycle.installOnQuit = false; lifecycle.terminationDeferred = false
        }
        trace(error == nil ? "cycle-finished" : "cycle-error")
        #if ZERO_UPDATER_FIXTURE
        if let error = error as NSError? {
            // Only known domain names and numeric codes enter fixture output.
            // Descriptions/userInfo can contain URLs, paths or other private data.
            let knownDomains: Set<String> = [SUSparkleErrorDomain, NSURLErrorDomain, NSCocoaErrorDomain, NSPOSIXErrorDomain]
            let domain = knownDomains.contains(error.domain) ? error.domain : "other"
            trace("cycle-error-detail domain=\(domain) code=\(error.code)")
        }
        #endif
        DispatchQueue.main.async { [weak self] in self?.tick() }
    }
    func standardUserDriverWillShowModalAlert() { lifecycle.modalUI = true; NSApp.setActivationPolicy(.regular) }
    func standardUserDriverDidShowModalAlert() { lifecycle.modalUI = false }
    func standardUserDriverWillHandleShowingUpdate(_ handleShowingUpdate: Bool, forUpdate update: SUAppcastItem, state: SPUUserUpdateState) {
        if handleShowingUpdate { lifecycle.updateUI = true; NSApp.setActivationPolicy(.regular); trace("update-ui") }
    }
    func standardUserDriverWillFinishUpdateSession() {
        lifecycle.updateUI = false
        DispatchQueue.main.async { [weak self] in self?.tick() }
    }
}
