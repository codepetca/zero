import AppKit

#if !ZERO_SETUP_TESTS
#if !ZERO_UPDATER_FIXTURE
if CommandLine.arguments.dropFirst().contains("--updater-fixture-handoff") {
    fputs("The updater fixture mode is unavailable in this build.\n", stderr)
    exit(64)
}
#endif
if CommandLine.arguments.dropFirst().first == "--runtime" {
    exit(MacRuntime.main(Array(CommandLine.arguments.dropFirst(2))))
}
let application = NSApplication.shared
application.setActivationPolicy(.regular)
let delegate = SetupApplication()
application.delegate = delegate
let menu = NSMenu()
let appMenuItem = NSMenuItem()
let appMenu = NSMenu()
appMenu.addItem(withTitle: "Check for Updates…", action: #selector(SetupApplication.checkForUpdates(_:)), keyEquivalent: "").target = delegate
appMenu.addItem(withTitle: "Update Settings…", action: #selector(SetupApplication.showUpdateSettings(_:)), keyEquivalent: "").target = delegate
appMenu.addItem(NSMenuItem.separator())
appMenu.addItem(withTitle: "Quit Zero", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
appMenuItem.submenu = appMenu
menu.addItem(appMenuItem)
application.mainMenu = menu
application.run()
#endif
