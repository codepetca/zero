# Hello, Java

A complete SimpleApp example: type a name and click **Say hello** or press Enter.
Blank input gives useful feedback. **Start again** clears the field and greeting.
This app responds to events; it has no update/draw loop.

## Copy and run

Stop your current app and save Main and any helpers outside `src/` first. In a
standalone Zero starter, copy these exact files:

| Example file | Destination |
| --- | --- |
| `examples/hello-app/Main.java` | `src/main/java/Main.java` (replace Main) |
| `examples/hello-app/theme.css` | `src/main/resources/hello-app/theme.css` (create the folder) |

Keep the framework in `src/main/java/zero/`, the pinned build files and wrappers.
The default quiz helper can stay; this example does not use it. Copying the CSS
is required: the app gives an explicit startup error when it is missing.
Open the standalone starter folder in VS Code and click **Zero → Run App**, or
run the following from that folder using a supported JDK 17+:

```sh
# macOS / Linux
./mvnw clean compile javafx:run
```

```powershell
# Windows PowerShell
.\mvnw.cmd clean compile javafx:run
```

The first build needs internet for the pinned dependencies. Save edits and run
again to rebuild. The example shelf is outside compiled source, so the default
quiz remains unchanged until you copy another Main into your own project.
In a repository checkout, first run `node scripts/prepare-starter.mjs` from the
repository root, then use a disposable copy of `student-template/`. An extracted
starter already has its framework sources and needs no preparation or Node.js.

## Three changes to try

1. Change the greeting in `greet()` to `"Welcome, " + enteredName + "!"`.
2. Change the primary button colour in theme.css from `#6457e8` to `#176b59`.
3. Change the VBox spacing from `16` to `24`; compare the layout.

The stylesheet supplies colours, fonts, rounded corners and visible focus, hover
and pressed states. Java owns the content, rules and layout. Try Tab to move
between controls, Enter in the name field and Space on a focused button.
The layouts respond to window size; very narrow windows may still clip content.

See [the beginner toolkit](../../BEGINNER.md) and [appearance guide](../../STYLE.md).
Maintainer checks and platform limits are in [checks/README.md](checks/README.md).
