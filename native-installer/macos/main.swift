import AppKit

#if !ZERO_SETUP_TESTS
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
}

let application = NSApplication.shared
application.setActivationPolicy(.regular)
let delegate = SetupApplication()
application.delegate = delegate
let menu = NSMenu()
let appMenuItem = NSMenuItem()
let appMenu = NSMenu()
appMenu.addItem(withTitle: "Quit Zero Setup", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
appMenuItem.submenu = appMenu
menu.addItem(appMenuItem)
application.mainMenu = menu
application.run()
#endif
