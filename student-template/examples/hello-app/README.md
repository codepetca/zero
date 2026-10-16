# Hello, Java

A complete App example: type a name and click **Say hello** or press Enter.
Blank input gives useful feedback. **Start again** clears the field and greeting
and returns focus to the name field. This app responds to events; it has no
update/draw loop. Ordinary JavaFX controls use the platform theme, with a larger
heading set through `Font`. No external stylesheet or media is needed.

## Copy and run

Use the complete [Hello, Java project](https://zero.codepet.ca/examples/hello-app),
or copy `examples/hello-app/Main.java` into a fresh standalone Zero starter at
`src/main/java/Main.java` (replace Main). Keep the framework in
`src/main/java/zero/`, the pinned build files and wrappers.

Open the standalone project folder in Zero and click **Run App** for the browser
preview. The first build needs internet for the pinned compiler and dependencies.
Save edits and Run App again to rebuild. For an explicit native JavaFX check,
run the following from the project folder with a supported JDK 17+:

```sh
# macOS
./mvnw clean compile javafx:run
```

```powershell
# Windows PowerShell
.\mvnw.cmd clean compile javafx:run
```

In a repository checkout, first run `node scripts/prepare-starter.mjs` from the
repository root, then use a disposable copy of `student-template/`. An extracted
starter already has its framework sources and needs no preparation or Node.js.
The example shelf stays outside compiled source until you copy its Main.

## Three changes to try

1. Change the greeting in `greet()` to `"Welcome, " + enteredName + "!"`.
2. Change the heading font size from `32` to `28`.
3. Change the VBox spacing from `16` to `24`; compare the layout.

Try Tab to move between controls, Enter in the name field and Space on a focused
button. The layouts respond to window size; very narrow windows may clip content.

The adjacent `theme.css` is an optional reference for advanced **native JavaFX**
experiments. The default Main does not load it, and the complete project download
does not require or include it. External JavaFX stylesheets are outside the
supported browser profile; adding the stylesheet-loading code requires the
explicit native workflow described in [the appearance guide](../../STYLE.md).

See [the beginner toolkit](../../BEGINNER.md).
Maintainer checks and platform limits are in [checks/README.md](checks/README.md).
