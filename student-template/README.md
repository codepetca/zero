# My Zero App

Open **this folder** in VS Code, complete the setup below, then start with
[Lesson 0: Hello, world!](lessons/00-hello-world.md). The [lesson guide](lessons/README.md)
uses three continuing projects: Greeting (0–2), Study (3–7) and Game (8–12).
Choose **Zero: Start project** to create each once, then keep its folder and add
to your own code in later lessons. Each practice scaffold contains an empty Main
and build/framework setup. Practice stays local; coursework and GitHub sharing
use a separate original project.
Run App opens a separate JavaFX window. After editing, click Run App again;
Zero saves your files and stops the previous run before rebuilding. The default build shortcut is
**Ctrl+Shift+B** on Windows or **Command+Shift+B** on macOS. Autosave runs after 500 ms; Run App also saves your files.
The Zero sidebar also provides Run App and Stop when its extension is installed.
The default build task is **Zero: Run App**, owned by the extension so its Stop
button can stop it. Without the extension, use **Tasks: Run Task → Run App without
Zero**, then close the app window or terminate that task before running again.

## First setup

This MVP targets **Mac with Apple Silicon** and **Windows**. Linux and Intel
Macs are unsupported. Choose Mac setup or the Windows complete-kit ZIP; the
native Windows EXE is not published. Physical Windows/classroom verification
remains pending, so the support target is not a claim of completed testing.

If you used **Download for Mac**, setup already prepares the Zero editor and
Java tools. Use **Open Zero.command** in your Zero folder to return to that
editor. The manual steps below are for the ZIP downloads.

If your **complete kit** includes a `setup/` folder, use its `setup/Setup.cmd` (Windows) or
`setup/Setup.command` (Mac with Apple Silicon) to check tools and
follow install/open actions. Keep the complete kit extracted; the starter-only
ZIP does not contain the launcher or Zero extension. You can use the steps below
instead. Inside VS Code, **Zero: Setup Help** offers a checklist, repair actions
and **Check again**. School IT can provide the tools before students start.

1. Install a JDK (Java Development Kit), **17 or newer**, and **Git 2.31 or newer** for uploads. JDK 17 was tested. Check `java -version` and
   `git --version` in a new terminal. This starter compiles to Java 17.
2. Install VS Code and optionally import **Zero.code-profile first** for the
   quiet settings-only profile. Open the Command Palette (**Ctrl+Shift+P** on
   Windows, **Command+Shift+P** on macOS) in your chosen profile. Use
   **Extensions: Install from VSIX…** and select the Zero **.vsix** file supplied
   beside `starter/` in your complete kit, then
   **Extensions: Install Extensions** for **Language
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
# Mac with Apple Silicon
./mvnw clean compile javafx:run
```

```powershell
# Windows PowerShell
.\mvnw.cmd clean compile javafx:run
```

If a copied ZIP loses the executable permission on a supported Mac, run
`chmod +x mvnw` once. The native Mac setup requires macOS 12+; JavaFX 21 itself
requires macOS 11+. Windows execution still needs classroom verification;
this prototype was checked on macOS arm64. Retained Linux wrappers and Intel
artifact code do not make those platforms supported in this MVP.

## Make something

Use the installed starter's **Run App** once to check setup: it opens a short
Hello, world! demonstration. Then choose **Zero: Start project → Greeting app**
to begin [Lesson 0](lessons/00-hello-world.md) with your own empty Main. Write the
label, then continue lessons 1 and 2 in that same Greeting folder.

Create **Study quiz** at lesson 3 and continue it through lesson 7. Create
**Coin game** at lesson 8 and continue it through lesson 12. Lesson 10 reopens
Study and Game to reuse your own class. Lesson 12's only optional download is
an image/sound ZIP; your own assets or drawing fallback work too.

**Zero: Open First Lesson** opens the project's first online lesson. The website sidebar
lets you choose your next lesson. A failed Run offers **Show Problems**.
See the [lesson guide](lessons/README.md) or optional [beginner toolkit](BEGINNER.md).
Complete examples are separate references; run them only in their own local copy.
The [appearance guide](STYLE.md) covers fonts, colours, layouts and editable styles.

The default is a short greeting with a single Label. Lesson 3 uses a tiny quiz
with `if`/`else` and feedback. The later scored quiz teaches fields, objects and
methods called by events. `settings()` sets the window title and initial content
size. `setup()` builds the interface once and calls `show(screen)` with an
ordinary JavaFX node. A button's `setOnAction(event -> checkAnswer())` means
“when clicked, call this method.” The method body is ordinary Java.

`SimpleApp` does not run an animation loop. The window is resizable; JavaFX
layouts such as VBox/HBox arrange and resize their children. The scored quiz uses
12-pixel spacing and 20-pixel padding directly in its VBox; change these numbers
or use normal JavaFX CSS. Main owns the points and scoring rule. `ScoreDisplay`
owns the label; `view()` is an ordinary method returning its JavaFX node. Every
screen creates a new ScoreDisplay object: a node can have only one parent.

Start the exercises in [EXERCISES.md](EXERCISES.md): change the quiz, extract a
component, reuse it in another app, then contribute a compatible improvement.
See [API.md](API.md) for the bundled app lifecycle, drawing/input methods and
ordinary JavaFX component conventions.

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

The `examples/` shelf is outside compiled `src/`. For Lessons 0–12, use
**Start project** at lessons 0, 3 and 8 to get an empty runnable scaffold. Keep
the same Greeting, Study or Game folder for its following lessons. Students write
their own controls and classes; lesson 12 offers only optional image/sound assets. For another
example, make a fresh local copy of the starter and copy only that example's
listed files into the new folder. Open the new folder in VS Code and click
**Run App**. Keep these practice projects local; your own game repository is
separate.

| Example | Exact files to copy | Try it |
| --- | --- | --- |
| Hello, Java | `examples/hello-app/Main.java` → `src/main/java/Main.java`; `examples/hello-app/theme.css` → `src/main/resources/hello-app/theme.css` | Type a name, say hello, reset, then change the theme. See [copy/run instructions](examples/hello-app/README.md). |
| Reach the coin | `examples/reach-the-coin/Main.java` and `examples/reach-the-coin/Player.java` | Move with arrows, touch the gold square to win, press R to restart. See [copy/run instructions](examples/reach-the-coin/README.md). |
| Say hello | `examples/hello-button/Main.java` | Click one button to change a greeting. See [Lesson 1](lessons/01-hello-button.md). |
| Greet by name | `examples/hello-name/Main.java` | Type your name, then click Say hello. See [Lesson 2](lessons/02-hello-name.md). |
| Click counter | `examples/click-counter/Main.java` | +1 counts clicks. See [Lesson 4](lessons/04-counter.md). |
| Reset counter | `examples/reset-counter/Main.java` | Reset clears the count; methods name each action. See [Lesson 5](lessons/05-methods.md). |
| Counter object | `examples/object-counter/Main.java`, `examples/object-counter/Counter.java` | Main explicitly uses an ordinary Counter. See [Lesson 6](lessons/06-objects.md). |
| One coin with controls | `examples/coin-game-controls/Main.java`, plus Player and Coin from `examples/coin-game/` | Native score/message/Restart beneath the canvas. See [Lesson 9](lessons/09-coin-game.md). |
| Shared component in a game | `examples/coin-game-component/Main.java`, Player/Coin from `examples/coin-game/`, and `examples/shared/ScoreDisplay.java` | Reuse the study app's display in a sketch. See [Lesson 10](lessons/10-components.md). |
| Composed study app | Main from `examples/composed-study/`, Question from `examples/study/`, StartScreen/Hud from `examples/composition-shared/`, and `examples/shared/ScoreDisplay.java` | Start, answer questions, finish and restart using shared views. [Exact copy list](examples/composed-study/README.md). |
| Composed coin game | Main from `examples/composed-game/`, Player/Coin from `examples/coin-game/`, StartScreen/Hud from `examples/composition-shared/`, and `examples/shared/ScoreDisplay.java` | Use the same views with an explicitly gated canvas game. [Exact copy list](examples/composed-game/README.md). |
| Move a player | `examples/movement/Main.java`, `examples/movement/Player.java` | Arrow keys move a square. See [Lesson 8](lessons/08-movement.md). |
| Sprite and sound | `examples/media-demo/Main.java`; its `resources/media-demo/` → `src/main/resources/media-demo/` | Draw your PNG, play your WAV. See [Lesson 12 stage 1](lessons/12-media.md#1-your-sprite-and-sound). |
| Scrolling game | `examples/scrolling-game/`: Main.java, Camera.java, Player.java, Coin.java; `examples/shared/ScoreDisplay.java`; media-demo resources as above | Scroll a wide world with a fixed native HUD. See [stage 2](lessons/12-media.md#2-a-scrolling-world-and-fixed-score). |
| Platform game | `examples/platform-game/`: Main.java, Camera.java, Player.java, Coin.java, Platform.java; `examples/shared/ScoreDisplay.java`; media-demo resources as above | Jump, land and collide with platforms. See [stage 3](lessons/12-media.md#3-gravity-platforms-and-collisions). |
| Two-level game | `examples/level-game/`: Main.java, Camera.java, Player.java, Coin.java, Platform.java, Level.java, Enemy.java; `examples/shared/ScoreDisplay.java`; media-demo resources as above | Collect coins, avoid enemies and advance levels. See [stage 4](lessons/12-media.md#4-enemies-and-two-levels). |
| Full platform game | `examples/full-game/`: Main.java, Camera.java, Player.java, Coin.java, Platform.java, Level.java, Enemy.java; `examples/shared/ScoreDisplay.java`; media-demo resources as above | Win or lose, then Restart a fresh game. See [stage 5](lessons/12-media.md#5-win-lose-and-restart). |
| Collect the coins | `examples/coin-game/Main.java`, `examples/coin-game/Player.java`, `examples/coin-game/Coin.java` | Collect three coins, win, Restart. See [Lesson 9](lessons/09-coin-game.md). |
| Tiny quiz | `examples/tiny-quiz/Main.java` | Answer 2 + 3, click Check, then try again. See [Lesson 3](lessons/03-quiz.md). |
| Scored quiz | `examples/quiz/Main.java` and `examples/shared/ScoreDisplay.java` | Wrong answer keeps points; trimmed “42” awards 10 once. |
| Practice tracker | `examples/practice/Main.java` and **the same** `examples/shared/ScoreDisplay.java` | Complete exercises, reset, then complete another. |
| Study app | `examples/study/Main.java`, `examples/study/Question.java` and **the same** `examples/shared/ScoreDisplay.java` | Retry answers, advance through the questions, finish and restart. See [the full app tutorial](lessons/07-study-app.md). |
| Follow the mouse | `examples/animation/Main.java` and `examples/animation/Player.java` | Move the mouse; hold Space to pull toward centre. |
| Keyboard | `examples/keyboard/Main.java` and `examples/keyboard/Mover.java` | Arrow keys move/clamp the circle; diagonal movement is faster. |
| Counter | `examples/counter/Main.java` | Native buttons beside a canvas change its displayed count. |
| Drawing | `examples/drawing/Main.java` | Primary button paints; secondary clears. Separate strokes stay separate. |

There is one reusable example source, `examples/shared/ScoreDisplay.java`; quiz,
practice, study and Lesson 12 game stages do not contain independent copies. The default compiled starter
contains the same file. If improving it for a contribution, update the shared
source and copy it into `src/main/java/ScoreDisplay.java`, then try the affected apps.
The no-argument constructor keeps the quiz's “Score” caption; the tracker passes
“Completed” to the optional caption constructor. Main still owns the number and
the rules. Study's Question class is an ordinary data object used by its question
array; it does not need a framework parent class.
The contributor verifier rejects starter/shared copy drift. Preserve your own
modified component before copying an example over it.

## Your repository and Pika

Click the profile icon beside GitHub in Zero and complete VS Code's native browser
flow. Its first letter identifies the signed-in account; hover for the full name
or click for change/sign-out actions. Sign-out opens VS Code Accounts, where you
select the GitHub account and choose Sign Out. Use **Connect a repo → Create a
repository…** to open GitHub's page.
Create your own **empty repository** on GitHub (leave README, license and
gitignore uninitialized). Use your own account and follow your teacher's
visibility instructions; there is no GitHub Classroom step. Connect its HTTPS
page URL through **Connect a repo → Connect an existing repository…**. Connect initializes Git in this standalone student folder if
needed and adds origin; it asks before replacing origin. It does not authenticate
or upload. Local running works without GitHub sign-in.

Before a real upload, configure Git's per-repository name/email identity.
Signing in does not configure commit identity. Zero supplies the selected native
GitHub session to its network operations without storing a token in your project
or Git configuration. Account/session changes require a fresh upload review.
See the kit's getting-started guide or ask your teacher for help. Never put a
password or token in Java source, the marker or README.

**Upload, Start and Finish default to simulation: no Git state changes or upload.**
To use the implemented real-upload path, set `"zero.uploadMode": "live"` in
workspace settings. Upload changes saves files, asks for a commit message, then shows a
modal review of your repository, branch and changed files. Check it before
choosing **Commit & Upload**. This creates a local commit when needed and pushes
with Git HTTPS transport using your native sign-in; ignored files stay local. A failed upload may
leave a local commit. A Mac teacher trial verified native sign-in and a private repository upload;
other platforms and school environments still need trials.

For a new repository, Upload changes once on **main** to save the starter.
Then use this individual flow for each improvement:

1. Click **main → Start a change**, name your branch (for example `quiz-feedback`)
   and review before creating it. Upload pending edits first. Main is updated
   from GitHub when it can be advanced without combining separate histories.
2. Edit and Run App. **Upload changes** saves and uploads progress to your branch;
   repeat as needed.
3. Click the branch name → **Finish change**. Upload pending edits first, run the
   app and review before merging/uploading into main. If newer main code is added
   to your branch, Zero pauses: run the combined app and review Finish again.
4. After confirmed success, you are back on main. Remove the finished local
   branch when prompted, or keep it; its GitHub branch remains.

If an update conflicts, your work and merge state remain. In VS Code Source
Control, inspect the conflicted files/Merge Editor, combine the intended changes,
save and stage them, then commit the merge. Run App and review Finish again.
Ask your teacher for help with an unclear conflict or diverged main history.
A failed Finish upload can leave local main advanced while your change branch
remains selected; repair the network/access problem and review Finish again.
Zero does not force-push or automatically discard work.

After a successful real Finish, check the files on GitHub's main branch. Click the connected
repository name and choose **Copy repository link**, then submit it separately
in Pika. Give your teacher access if it is
private. Zero does not submit assignments or change Pika grades.

## Checking your changes

Run your app after each change. For the quiz, try both correct and incorrect answers.
Use the examples and exercises to check the behavior you changed. A compile
alone does not verify layout, focus or school-machine restrictions.

Zero maintainers keep the finite framework and example GUI checks in the
[Zero source repository](https://github.com/codepetca/zero). These contributor tools are separate from this student
project; your normal Run App launches Main and needs only the Maven wrapper.

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
[wrapper notice](.mvn/wrapper/NOTICE). These apply to the wrapper. Original Zero source uses the bundled
[MIT license](LICENSE).
