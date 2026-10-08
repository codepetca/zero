# My Zero App

Open **this folder** in VS Code. Start with `src/main/java/Main.java` and
`ScoreDisplay.java` (the score helper). Run App opens a separate JavaFX window. Save changes, close or
Stop the old app, and Run App again to rebuild. The default build shortcut is
**Ctrl+Shift+B** on Windows/Linux or **Command+Shift+B** on macOS. Autosave runs after 500 ms; Run App also saves your files.
The Zero sidebar also provides Run App and Stop when its extension is installed.
The default build task is **Zero: Run App**, owned by the extension so its Stop
button can stop it. Without the extension, use **Tasks: Run Task → Run App without
Zero**, then close the app window or terminate that task before running again.

## First setup

1. Install a JDK (Java Development Kit), **17 or newer**, and **Git 2.31 or newer** for uploads. JDK 17 was tested. Check `java -version` and
   `git --version` in a new terminal. This starter compiles to Java 17.
2. Install VS Code and optionally import **Zero.code-profile first** for the
   quiet settings-only profile. In your chosen profile, install the local **zero-0.3.1.vsix**, **Language
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

The default is a tiny quiz. It teaches fields, objects, native controls, and
methods called by events. `settings()` sets the window title and initial content
size. `setup()` builds the interface once and calls `show(screen)` with an
ordinary JavaFX node. A button's `setOnAction(event -> checkAnswer())` means
“when clicked, call this method.” The method body is ordinary Java.

`SimpleApp` does not run an animation loop. The window is resizable; JavaFX
layouts such as VBox/HBox arrange and resize their children. This quiz uses
12-pixel spacing and 20-pixel padding directly in its VBox; change these numbers
or use normal JavaFX CSS. Main owns the points and scoring rule. `ScoreDisplay`
owns the label; `view()` is an ordinary method returning its JavaFX node. Every
screen creates a new ScoreDisplay object: a node can have only one parent.

Start the exercises in [EXERCISES.md](EXERCISES.md): change the quiz, extract a
component, reuse it in another app, then contribute a compatible improvement.

### Animated apps

Choose `SketchApp` for animation, drawing or games. It extends the same SimpleApp
startup, creates a canvas before setup, then calls `update(double seconds)` and
`draw()` each frame. Your Main explicitly calls ordinary objects such as
`player.update(...)` and `player.draw(this)`; there is no automatic object lifecycle.
Both lifecycle callbacks and JavaFX events run on the JavaFX application thread.
Slow work freezes the interface. A failed frame stops the animation and reports
one stack trace instead of repeating it every frame.

For a sketch, `size` means **fixed canvas dimensions**. The window can grow and
native controls fit around the canvas; resizing the window does not scale its
pixels. Elapsed seconds are capped at 0.1 after a long pause. Drawing does not
clear automatically: call `background(Color.WHITE)` in draw for a fresh frame.

Useful methods inherited from SketchApp:

| Purpose | Example |
| --- | --- |
| Canvas size | `width()`, `height()` |
| Filled shapes | `fill(Color.BLUE); rect(10, 20, 50, 30);` |
| Circle centred at x/y | `circle(100, 100, 40);` (40 is diameter) |
| Outlines/lines | `stroke(Color.BLACK); strokeWidth(2); outlineRect(10, 20, 50, 30);` |
| Text | `textSize(20); text("Hello", 20, 40);` (y is baseline) |
| Mouse | `mouseX()`, `mouseY()`, `mouseDown(MouseButton.PRIMARY)` |
| Held keys | `keyDown(KeyCode.LEFT)` |
| Images | `loadImage("/player.png")` in setup; `image(sprite, x, y)` in draw |

Use imports from `javafx.scene.input` for KeyCode and MouseButton. Mouse positions
are canvas coordinates and can leave its bounds while dragging. **Click the
canvas to play.** Held keys belong to the focused canvas; clicking or typing in
native controls does not press game keys or mouse buttons. Moving focus to a
control or another window clears held inputs. Releasing an owned button outside
the canvas also clears it. Put images in `src/main/resources`; load once in setup.

Use normal JavaFX through `graphics()` (GraphicsContext), `canvas()`, and
`layout()` (BorderPane). In SketchApp.setup(), `layout().setBottom(button)` adds a
native control. Keep the canvas in the centre. The counter example proves this
mixed UI approach; use `show(Node)` for the event-driven SimpleApp examples.

Read the bundled framework in `src/main/java/zero/SimpleApp.java` and
`SketchApp.java`. It has shared startup and a small drawing/input API, with no
component base class, scene routing, or object discovery.

## Try an example

The `examples/` shelf is outside compiled `src/`. Choose **one Main at a time**.
Stop the app and save your current Main and helper classes outside `src/` (or in
your own Git repository) before switching. Copy the files listed below into
`src/main/java/`, replacing Main. Keep the `zero/` framework folder. Run as usual;
no pom.xml or zero.json changes are needed. Unused helpers may be removed.

| Example | Exact files to copy | Try it |
| --- | --- | --- |
| Default quiz | `examples/quiz/Main.java` and `examples/shared/ScoreDisplay.java` | Wrong answer keeps points; trimmed “42” awards 10 once. |
| Practice tracker | `examples/practice/Main.java` and **the same** `examples/shared/ScoreDisplay.java` | Complete exercises, reset, then complete another. |
| Follow the mouse | `examples/animation/Main.java` and `examples/animation/Player.java` | Move the mouse; hold Space to pull toward centre. |
| Keyboard | `examples/keyboard/Main.java` and `examples/keyboard/Mover.java` | Arrow keys move/clamp the circle; diagonal movement is faster. |
| Counter | `examples/counter/Main.java` | Native buttons beside a canvas change its displayed count. |
| Drawing | `examples/drawing/Main.java` | Primary button paints; secondary clears. Separate strokes stay separate. |

There is one reusable example source, `examples/shared/ScoreDisplay.java`; quiz
and practice do not contain independent copies. The default compiled starter
contains the same file. If improving it for a contribution, update the shared
source and copy it into `src/main/java/ScoreDisplay.java`, then try both apps.
The contributor verifier rejects starter/shared copy drift. Preserve your own
modified component before copying an example over it.

## Your repository and Pika

Choose **Sign in to GitHub** in Zero and complete VS Code's native browser flow.
Check the selected account, then use **Create Repository** to open GitHub's page.
Create your own **empty repository** on GitHub (leave README, license and
gitignore uninitialized). Use your own account and follow your teacher's
visibility instructions; there is no GitHub Classroom step. Connect its HTTPS
page URL in Zero. Connect initializes Git in this standalone student folder if
needed and adds origin; it asks before replacing origin. It does not authenticate
or upload. Local running works without GitHub sign-in.

Before a real upload, configure Git's per-repository name/email identity.
Signing in does not configure commit identity. Zero supplies the selected native
GitHub session to its network operations without storing a token in your project
or Git configuration. Account/session changes require a fresh upload review.
See the kit's getting-started guide or ask your teacher for help. Never put a
password or token in Java source, the marker or README.

**Upload defaults to simulation: nothing is staged, committed or uploaded.**
To use the implemented real-upload path, set `"zero.uploadMode": "live"` in
workspace settings. Upload saves files, asks for a commit message, then shows a
modal review of your repository, branch and changed files. Check it before
choosing **Commit & Upload**. This creates a local commit when needed and pushes
with Git HTTPS transport using your native sign-in; ignored files stay local. A failed upload may
leave a local commit. A Mac teacher trial verified native sign-in and a private repository upload;
other platforms and school environments still need trials.

After a successful real upload, check the files on GitHub. Copy your repository
page link and submit it separately in Pika. Give your teacher access if it is
private. Zero does not submit assignments or change Pika grades.

## Contributor verification

```sh
./mvnw -B -Psmoke clean compile javafx:run
```

On Windows use `.\mvnw.cmd` instead. This opens a small real window, checks
both startup paths, actual UI resizing, elapsed time, shape pixels, canvas/control
focus, held-input release, configuration/setup/frame failures and shutdown, prints
`ZERO_SMOKE_OK`, then closes itself.
It requires a GUI desktop; input events are synthetic, so this does not replace
physical typing/clicking checks. `SmokeLauncher.java` is a contributor check; normal
Run App launches Main. From the kit repository, `python3 scripts/verify-examples.py` checks all six
alternatives in temporary real GUI projects and verifies shared source copies.
This does not verify an imported VS Code profile or real
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
