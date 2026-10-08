# My Zero App

Open **this folder** in VS Code. Start with `src/main/java/Main.java` and
`Player.java`. Run App opens a separate JavaFX window. Save changes, close or
Stop the old app, and Run App again to rebuild. The default build shortcut is
**Ctrl+Shift+B** on Windows/Linux or **Command+Shift+B** on macOS. Autosave runs after 500 ms; Run App also saves your files.
The Zero sidebar also provides Run App and Stop when its extension is installed.
The default build task is **Zero: Run App**, owned by the extension so its Stop
button can stop it. Without the extension, use **Tasks: Run Task → Run App without
Zero**, then close the app window or terminate that task before running again.

## First setup

1. Install a JDK (Java Development Kit), **17 or newer**, and Git. JDK 17 was tested. Check `java -version` and
   `git --version` in a new terminal. This starter compiles to Java 17.
2. Install VS Code and import **Zero.code-profile first**. This is a settings-only
   profile. In that profile, install the local **zero-0.2.0.vsix**, **Language
   Support for Java by Red Hat** (`redhat.java`), and **Debugger for Java**
   (`vscjava.vscode-java-debug`). Follow the Java extension's
   setup help if it needs its own newer language-server JDK; the project's JDK
   and the editor's JDK can be different.
3. Copy the starter into your own folder outside any other Git repository,
   open that folder in VS Code,
   and trust the folder if you trust its source. Keep `zero.json`, `pom.xml`,
   both Maven wrappers, and the `.mvn` folder with it.
4. Run App. The first run needs internet to download the pinned Maven and
   JavaFX dependencies. You do not need a separate Maven or JavaFX installation.
   A school proxy/firewall can block these downloads; ask your teacher rather
   than adding passwords or tokens to project files.

Terminal equivalent, from this folder:

```sh
# macOS / Linux
./mvnw clean compile javafx:run
```

```powershell
# Windows PowerShell
.\mvnw.cmd clean compile javafx:run
```

If a copied ZIP loses the executable permission on macOS/Linux, run
`chmod +x mvnw` once. JavaFX 21 requires macOS 11+; Linux requires a working
GUI session and GTK 3.8+. Windows and Linux execution still need classroom
verification; this prototype was checked on macOS arm64.

## Make something

`settings()` sets the fixed canvas size and window title. `setup()` creates your
objects once. Every frame calls `update(double seconds)` and then `draw()`.
Movement uses elapsed seconds so different computers have similar speeds.
Long pauses are capped at 0.1 seconds. Drawing does not automatically clear the
canvas: call `background(Color.WHITE)` in draw if you want a fresh frame.

`Player` is an ordinary Java object. Main explicitly calls `player.update(...)`
and `player.draw(this)`. Add more ordinary classes the same way. The framework
does not discover objects or update them for you.

Useful methods inherited from SimpleApp:

| Purpose | Example |
| --- | --- |
| Canvas size | `width()`, `height()` |
| Filled shapes | `fill(Color.BLUE); rect(10, 20, 50, 30);` |
| Circle centred at x/y | `circle(100, 100, 40);` (40 is diameter) |
| Outlines and lines | `stroke(Color.BLACK); strokeWidth(2); outlineRect(10, 20, 50, 30);` |
| Text | `textSize(20); text("Hello", 20, 40);` (y is baseline) |
| Mouse | `mouseX()`, `mouseY()`, `mouseDown(MouseButton.PRIMARY)` |
| Held keys | `keyDown(KeyCode.LEFT)` |
| Images | `loadImage("/player.png")` in setup; `image(sprite, x, y)` in draw |

Use imports from `javafx.scene.input` for KeyCode and MouseButton. Mouse positions
are canvas coordinates and can be outside its bounds while dragging. Held inputs
clear when the window loses focus. Put images in `src/main/resources`; load once
in setup rather than every frame.

For JavaFX features beyond these helpers, use `graphics()` (GraphicsContext),
`canvas()`, and `layout()` (BorderPane). For example, in setup:

```java
javafx.scene.control.Button reset = new javafx.scene.control.Button("Reset");
reset.setOnAction(event -> player = new Player(width() / 2, height() / 2));
layout().setBottom(reset);
```

The small framework lives in **`src/main/java/zero/SimpleApp.java`**. Read it,
propose improvements, and contribute understandable changes for later students.
It is bundled source so you can inspect the same code that your app runs.

## Try an example

The `examples/` folder is a shelf of alternatives, outside the compiled `src/`
folder. Each example has its own `Main.java`; choose **one at a time**.

1. Save a copy of your current `src/main/java/Main.java` somewhere outside `src/`
   (or save your work in your own Git repository).
2. Copy the chosen example's `Main.java` over `src/main/java/Main.java`. For the
   keyboard example, also copy `Mover.java` into `src/main/java/`.
3. Run App as usual. Stop the app before switching examples. Restore your saved
   Main when you want to return to your project; an unused Mover or Player can
   stay in the folder or be removed.

Do not copy the whole examples folder into `src/`: these alternatives all use
the same Main class name. They need no changes to `pom.xml` or `zero.json`.

| Example | Try it | Next idea |
| --- | --- | --- |
| `examples/keyboard` | Hold arrow keys; the circle stays inside the canvas. Main explicitly updates and draws a Mover object. | Add a second Mover with different keys, or a target to reach. |
| `examples/counter` | Click Add one and Reset. Standard JavaFX buttons and a label sit below the canvas using `layout()`. | Add a subtract button, a goal, or quiz choices. |
| `examples/drawing` | Hold the primary (usually left) mouse button to paint; hold the secondary (usually right) button to clear. | Add colour choices or change brush width. |

All three follow the same lifecycle: settings configures the window, setup runs
once after the canvas exists, and each frame runs update then draw. The counter
uses short JavaFX button callbacks to change its fields. The drawing example
clears only in setup or when requested, so previous marks remain visible.
Keyboard movement is measured in pixels per second on each axis; diagonal
movement is therefore faster. Try changing that rule after you understand it.

For a contribution, start with one small feature that helps another student:
a readable example, a useful error message, or a focused drawing helper. Explain
what it does and how to try it, preserve explicit object updates, and include
the checks you actually ran. Review a contribution and try it on a student
machine before a cohort adopts it. Avoid a large engine change for one app's needs.

## Your repository and Pika

Create your own **empty repository** on GitHub (leave README, license and
gitignore uninitialized). Use your own account and follow your teacher's
visibility instructions; there is no GitHub Classroom step. Connect its HTTPS
page URL in Zero. Connect initializes Git in this standalone student folder if
needed and adds origin; it asks before replacing origin. It does not authenticate
or upload. Local running works without GitHub sign-in.

Before a real upload, configure Git's name/email identity and a standard Git
credential helper/browser authentication flow. VS Code's GitHub UI sign-in alone
may not configure credentials for Zero's separate Git process. See the kit's
getting-started guide or ask your teacher for help. Never put a password or token
in Java source, the marker or README.

**Upload defaults to simulation: nothing is staged, committed or uploaded.**
To use the implemented real-upload path, set `"zero.uploadMode": "live"` in
workspace settings. Upload saves files, asks for a commit message, then shows a
modal review of your repository, branch and changed files. Check it before
choosing **Commit & Upload**. This creates a local commit when needed and pushes
with normal Git HTTPS transport; ignored files stay local. A failed upload may
leave a local commit. Real GitHub authentication/upload has not been verified.

After a successful real upload, check the files on GitHub. Copy your repository
page link and submit it separately in Pika. Give your teacher access if it is
private. Zero does not submit assignments or change Pika grades.

## Contributor verification

```sh
./mvnw -B -Psmoke clean compile javafx:run
```

On Windows use `.\mvnw.cmd` instead. This opens a small real window, checks
settings/setup/update/draw ordering, elapsed time, actual shape pixels, held-key
events and a standard JavaFX control, prints `ZERO_SMOKE_OK`, then closes itself.
It requires a GUI desktop. `SmokeLauncher.java` is a contributor check; normal
Run App launches Main. This does not verify an imported VS Code profile or real
GitHub authentication/upload.

Pinned dependencies: JavaFX **21.0.12**, Maven **3.9.11**, official Apache Maven
Wrapper **3.3.4** (only-script), JavaFX Maven plugin **0.0.8**, compiler plugin
**3.14.0**. The wrapper verifies the Maven distribution's SHA-256. Maven's normal
local dependency cache is used; no account credentials are required.

Sources: [OpenJFX 21 release requirements](https://github.com/openjdk/jfx/blob/jfx21/doc-files/release-notes-21.md),
[OpenJFX Maven setup](https://openjfx.io/openjfx-docs/#maven),
[JavaFX 21.0.12 artifact](https://repo.maven.apache.org/maven2/org/openjfx/javafx-controls/21.0.12/),
[Apache Maven Wrapper](https://maven.apache.org/tools/wrapper/).

The bundled Apache Maven Wrapper scripts retain their upstream attribution.
See [wrapper license](.mvn/wrapper/LICENSE-APACHE-2.0.txt) and
[wrapper notice](.mvn/wrapper/NOTICE). These apply to the wrapper; a public license
for the original Zero code has not yet been selected.
