import AppKit

#if !ZERO_SETUP_TESTS
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
