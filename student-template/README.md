# My Zero App

This source is included in the local Mac candidate **0.5.51** with core **0.3.0**.
Older downloads keep their own bundled instructions and API.

Zero 0.5.27 uses a native JavaFX window for Run App. Mac 0.5.26 and other
earlier downloads retain their bundled Run behavior.

This bundled Hello World project is an installation check, not your lesson 0
repository. Use it to check local setup; create your own tutorial clone for
[Lesson 0: Hello, world!](lessons/00-hello-world.md). The [lesson guide](lessons/README.md)
uses three continuing projects: Greeting (0–2), Study (3–7) and Game (8–12).
Choose **Start tutorial** from Zero’s welcome or **…** menu to create each matching
tutorial project once. Enter a name and choose a clone location (default
`~/Zero Projects`), then choose **Clone here**. Zero creates a public repository
in your GitHub account from the verified template and opens its clone. Its source
and included files are public. The lesson page's **Use template** action also lets
you create a repository on GitHub; clone your own repository through **Project →
Clone from GitHub…**.
Zero reuses the current window with the editor’s normal unsaved-work handling.
For an already-cloned Zero folder, choose **Project → Open local project…**
to open it without cloning again. Keep that clone and add your own code across its lessons. Each template contains only empty Main
and build/framework setup. Tutorial repositories use New branch, Run App,
Commit & push and Merge to main, like original coursework projects. Template links
follow verified publication metadata; unavailable templates show that state.
Run App compiles your Java locally with the project’s Maven wrapper, then opens
your app in its own native JavaFX window.
After editing, click Run App again; Zero saves your files and stops the previous
app process before rebuilding. The default build shortcut is
**Ctrl+Shift+B** on Windows or **Command+Shift+B** on macOS. Autosave runs after 500 ms; Run App also saves your files.
The Zero sidebar also provides Run App and Stop when its extension is installed.
The default build task is **Zero: Run App**, owned by the extension so **Stop**
cancels the build or running app process. Closing the app window returns Run to
idle. Without the extension, **Tasks: Run Task → Run App without Zero** also
runs native JavaFX; close its window or terminate the task before running again.
Local Run does not check browser compatibility; Publish app and advanced Export
for web perform those checks and browser compilation when requested.

## First setup

Before tutorial lesson 0, have **your own verified GitHub account and Git 2.31+**.
Use [github.com/signup](https://github.com/signup) if needed. Follow your teacher's
username/email policy and check GitHub access, Zero browser sign-in and compiler
downloads on your school machine; ask teacher/IT about restrictions. Confirm that
public tutorial source is allowed before creating through Zero. Keep private files
out of public repositories. For an existing or GitHub-created private repository,
invite the teacher's confirmed username as a collaborator and verify access;
a private link alone grants none, and collaborators can edit.
Set your teacher-approved Git name/email per repository; for email privacy, copy
the exact GitHub `noreply` address from Settings → Emails. Keep passwords/tokens
out of projects. See [the account/privacy guide](https://zero.codepet.ca/docs/setup#before-lesson-0-github-and-privacy).
The ordinary local Hello World check below needs no account. After cloning and
compiler caching, tutorial Run works offline; pushing needs internet/sign-in.
Publishing is optional and public; Pages from an existing private repository depends
on the account plan. No paid plan is needed for tutorial source work.

This MVP targets **Mac with Apple Silicon** and **Windows**. Linux and Intel
Macs are unsupported. Choose Mac setup. For Windows, choose the unsigned
0.5.21 preview installer or its matching complete-kit ZIP. Windows automatic
updates are disabled. Physical Windows/classroom verification remains pending,
so the support target is not a claim of completed testing.

If you used the current **Download for Mac**, open the DMG and drag **Zero.app**
into **Applications**, then open Zero to prepare the editor and Java tools.
Later, reopen **Zero** from Applications or the Dock to return to your saved
editor session. Older Mac kits may use **Open Zero.command** in the Zero folder;
follow the guide bundled with that version. The manual steps below are for ZIP downloads.

If your **complete kit** includes a `setup/` folder, use its `setup/Setup.cmd` (Windows) or
`setup/Setup.command` (Mac with Apple Silicon) to check tools and
follow install/open actions. Keep the complete kit extracted; the starter-only
ZIP does not contain the launcher or Zero extension. You can use the steps below
instead. Inside VS Code, **Zero: Setup Help** offers a checklist, repair actions
and **Check again**. School IT can provide the tools before students start.

1. Install a JDK (Java Development Kit), **17 or newer**, and **Git 2.31 or newer** for tutorials and pushes. JDK 17 was tested. Check `java -version` and
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
   both Maven wrappers, the `.mvn` folder, `zero-core.json` and the complete
   `.zero-build` folder with it. Commit these source/build files to your own repository.
4. Run App. The first run needs internet to download the pinned Maven and JavaFX
   dependencies; later runs reuse the local cache. You do
   not need Node.js, global Maven or a separate JavaFX installation.
   A school proxy/firewall can block these downloads; ask your teacher rather
   than adding passwords or tokens to project files.

Your saved `.zero-build` folder contains the browser compiler rules and adapters
for this project. Keep it unchanged when updating the Zero editor. Its README
records the browser runtime requirements and explicit standalone commands.
Native Run remains available without Node. Browser tooling updates are deliberate:
work on a copy or Git branch, check the result, and keep the original recoverable.
A saved finished web ZIP can be hosted separately from rebuilding the Java source.

To run native JavaFX from a terminal in this folder:

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
Hello, world! demonstration in its own JavaFX window. Then choose
**Start tutorial → Greeting app** from Zero’s welcome or **…** menu
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

`App` does not run an animation loop. The window is resizable; JavaFX
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

Choose `GameApp` for animation, drawing or games. It extends the same App
startup, creates a canvas before setup, then calls `update(double seconds)` and
`draw()` each frame. Your Main explicitly calls ordinary objects such as
`player.update(...)` and `player.draw(this)`; there is no automatic object lifecycle.
Both lifecycle callbacks and JavaFX events run on the JavaFX application thread.
Slow work freezes the interface. A failed frame stops the animation and reports
one stack trace instead of repeating it every frame.

For a game, `size` means **fixed canvas dimensions**. The window can grow and
native controls fit around the canvas; resizing the window does not scale its
pixels. Elapsed seconds are capped at 0.1 after a long pause. Drawing does not
clear automatically: call `background(Color.WHITE)` in draw for a fresh frame.

Useful methods inherited from GameApp:

| Purpose | Example |
| --- | --- |
| Canvas size | `width()`, `height()` |
| Filled shapes | `fill(Color.BLUE); rect(10, 20, 50, 30);` |
| Circle centred at x/y | `circle(100, 100, 40);` (40 is diameter) |
| Outlines/lines | `stroke(Color.BLACK); strokeWidth(2); outlineRect(10, 20, 50, 30);` |
| Text | `textSize(20); text("Hello", 20, 40);` (y is baseline) |
| Mouse | `mouseX()`, `mouseY()`, `mouseDown(MouseButton.PRIMARY)` |
| Held keys | `keyDown(KeyCode.LEFT)` |
| Audio | `loadSound("/chime.wav")` / `loadMusic("/music.wav")` in setup; play on events, explicitly pause/stop music |
| Images | `loadImage("/player.png")` in setup; `image(sprite, x, y)` in draw |

Use imports from `javafx.scene.input` for KeyCode and MouseButton. Mouse positions
are canvas coordinates and can leave its bounds while dragging. **Click the
canvas to play.** Held keys belong to the focused canvas; clicking or typing in
native controls does not press game keys or mouse buttons. Moving focus to a
control or another window clears held inputs. Releasing an owned button outside
the canvas also clears it. Put images in `src/main/resources`; load once in setup. Sound/Music also work in ordinary App interfaces; see
the [audio guide](APP-GUIDE.md#short-sound-effects). Owned audio closes automatically
on shutdown and startup/frame failure. Game pause/restart policy stays in Main. Successful image loads
share an app-scoped cache until shutdown. The starter also includes
explicitly updated SpriteAnimation, ImageRegion, frame-edge input, centred/
flipped image drawing, centred text and static Collisions predicates. These
helpers are included in Mac setup 0.5.23/core 0.2.1. Older downloads keep their
bundled API.
See the [game helper guide](APP-GUIDE.md#sprite-frames-and-small-game-helpers) and
[complete API](API.md).

Use normal JavaFX through `graphics()` (GraphicsContext), `canvas()`, and
`layout()` (BorderPane). In GameApp.setup(), `layout().setBottom(button)` adds a
native control. Keep the canvas in the centre. The counter example proves this
mixed UI approach; use `show(Node)` for the event-driven App examples.

Read the bundled framework in `src/main/java/zero/App.java` and
`GameApp.java`. It has shared startup and a small drawing/input API, with no
component base class, scene routing, or object discovery.

## Add classes, files and folders

Use **New… (+)** in the Project header, or right-click a file or folder in the
tree. **java** maps to `src/main/java`; **resources** maps to
`src/main/resources`. Select a folder to create there, or a file to create beside it:

- **New class…**: enter `Player` (or `Player.java`). Zero creates an ordinary
  `public class Player` in the selected Java package (beside Main by default) and opens it. Create and
  call its objects from Main; no registration or build configuration is needed.
- **New package…**: enter a Java package such as `game.characters`.
- **New file…**: enter a filename in the selected location. Zero opens it for editing.
- **New folder…**: enter a folder name in the selected location.

Use `/` for subfolders, such as `data/questions.txt` or `images/backgrounds`.
Existing files and folders are preserved; choose another name if one exists.
Cancel leaves the project unchanged. The file list refreshes automatically.
Right-click resources or a folder inside it to import existing images/audio.
Right-click an asset and choose **Copy Asset Path** for its path in Java.
**Rename…** changes an editable file's name; Java declarations and references
need their own source edits. The Project **⋯** menu contains Refresh, Collapse
All, Show all project files and ZeroHub. **Zero: Use Standard Explorer** restores
the ordinary file tree; **Zero: Use Student Explorer** returns here.
Click **Run** to rebuild after
editing (stop the current preview first if it is running).

## Try an example

The `examples/` shelf is outside compiled `src/`. For Lessons 0–12, use
**Start tutorial** from Zero’s welcome or **…** menu at lessons 0, 3 and 8 to create your own
repository from the matching empty template and clone it. Keep the same Greeting, Study or Game
repository for its following lessons. Students write
their own controls and classes; lesson 12 offers only optional image/sound assets. Some reference examples use native JavaFX APIs outside the browser subset;
these run natively with Run App. Publish app or Export for web reports unsupported
browser calls before browser compilation.
For another example, make a fresh local copy of the starter and copy only that example's
listed files into the new folder. Open the new folder in VS Code and click
**Run App**. Optional reference copies are separate from the template-clone
tutorial path. ZeroHub contributions use original projects of your own.

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
| Shared component in a game | `examples/coin-game-component/Main.java`, Player/Coin from `examples/coin-game/`, and `examples/shared/ScoreDisplay.java` | Reuse the study app's display in a game. See [Lesson 10](lessons/10-components.md). |
| Composed study app | Main from `examples/composed-study/`, Question from `examples/study/`, StartScreen/Hud from `examples/composition-shared/`, and `examples/shared/ScoreDisplay.java` | Start, answer questions, finish and restart using shared views. [Exact copy list](examples/composed-study/README.md). |
| Composed coin game | Main from `examples/composed-game/`, Player/Coin from `examples/coin-game/`, StartScreen/Hud from `examples/composition-shared/`, and `examples/shared/ScoreDisplay.java` | Use the same views with an explicitly gated canvas game. [Exact copy list](examples/composed-game/README.md). |
| Move a player | `examples/movement/Main.java`, `examples/movement/Player.java` | Arrow keys move a square. See [Lesson 8](lessons/08-movement.md). |
| Sprite playground | `examples/sprite-playground/Main.java` → `src/main/java/Main.java`; `examples/sprite-playground/src/main/resources/bird-flap-sheet.png` → `src/main/resources/bird-flap-sheet.png` | Independent sprite clocks share one image; arrows move, Space/click pauses, R resets, geometry changes the target colour. [Copy/run instructions](examples/sprite-playground/README.md). Included in Mac setup 0.5.23/core 0.2.1; older kits retain their bundled API. |
| Audio playground | `examples/audio-playground/Main.java` → `src/main/java/Main.java`; `examples/audio-playground/resources/audio-playground/` → `src/main/resources/audio-playground/` | Load once, trigger an effect and loop/pause/resume/stop/mute music with native buttons. [Copy/run instructions](examples/audio-playground/README.md). Included in Mac setup 0.5.23/core 0.2.1; older kits retain their bundled API. |
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

Choose **Sign in to GitHub** on Zero's Start Page and complete GitHub's browser
flow. Returning to Zero shows your account; **Start tutorial** becomes available
after project access is ready. Use Zero's GitHub account actions to change account
or sign out. Sign-out disconnects Zero while preserving your projects and other
extensions' accounts.

If you created your own repository from a ZeroHub template and cloned it,
keep that clone and its existing origin; skip creating an empty repository.
For an extracted ZIP, open GitHub's new-repository page in your browser.
Create your own **empty repository** on GitHub (leave README, license and
gitignore uninitialized). Use your own account and follow your teacher's
visibility instructions; there is no GitHub Classroom step. Connect its HTTPS
page URL through **Project → Connect to GitHub…** with the local Zero folder open. Connect initializes Git in this standalone student folder if
needed and adds origin; it asks before replacing origin. It does not authenticate
or push. Local running works without GitHub sign-in.

Before a real push, configure Git's per-repository name/email identity.
In your project terminal, replace the examples with your teacher-approved display
name and commit email. For email privacy, use the exact GitHub `noreply` address
shown in Settings → Emails, rather than your personal email:

```sh
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

These commands apply only to this repository. For more help, read
[the online repository setup guide](https://zero.codepet.ca/docs/setup#your-github-repository)
or ask your teacher.
Signing in does not configure commit identity. Zero supplies the selected native
GitHub session to its network operations without storing a token in your project
or Git configuration. Account/session changes require a fresh push review.
Never put a password or token in Java source, the marker or README.

**GitHub actions are live by default; nothing pushes automatically.**
Commit & push saves files and asks for a commit message, showing your repository
and branch in the input. Check your changes, enter a short message and press
Enter. This creates a local commit when needed and pushes
the current branch with Git HTTPS transport using your native sign-in; ignored files stay local. A failed push may
leave a local commit. A Mac teacher trial verified native sign-in and a private repository push;
other platforms and school environments still need trials.

For a new repository, Commit & push once on **main** to save the starter.
Then use this individual flow for each improvement:

1. Click **New branch** in the repository menu, name your branch (for example `quiz-feedback`)
   and press Enter to create it. Commit & push pending edits first. Current source
   creates the branch locally from main, with no GitHub request or sign-in needed.
   Choose **Update from main** first if you want the latest completed main.
2. Edit and Run App. **Commit & push** creates a commit when needed and pushes your current branch;
   repeat as needed.
3. Click **Merge to main** beside the branch name. Commit & push pending edits first, run the
   app before clicking. **Merge to main** merges your branch into main and pushes
   main. If GitHub refuses because main has newer work, choose **Update from main**.
   It merges GitHub main into the current feature without uploading; run and
   check the combined app, then retry Merge to main.
4. After confirmed success, you are back on main. Zero safely removes the
   unchanged finished local branch; its GitHub branch remains. If cleanup cannot
   be completed safely, Zero keeps the local branch and tells you to check Output.

Older kits may use different account/repository controls, with **Start a change**
and different labels for committing, pushing and merging. Their installed controls remain
unchanged; the steps above describe the current editor.

**Update from main** combines completed GitHub main with your local main or
feature, keeping unpublished commits. **Update branch from GitHub** separately
gets work made on the same feature branch on another computer. Neither uploads.
**Save checkpoint & update/switch** explicitly saves uncommitted work locally
before continuing. Older editor kits retain their bundled controls.

For text conflicts, choose the local or incoming conflicting section in Zero's
sidebar. Automatically combined edits are kept. Images and deleted files use
whole-file choices; complex conflicts use native Source Control. **Cancel update**
restores the starting checkpoint only while no external edits/ref changes would
be lost. Run the combined app, then Commit & push. A saved commit whose push fails
remains local; use its Update/retry/sign-in action. **Check GitHub status** verifies
an interrupted push without uploading. Ask your teacher if a conflict is unclear.
A failed main push can leave local main advanced while your change branch
remains selected; repair the network/access problem and review Merge to main again.
Zero does not force-push or automatically discard work.

After a successful Merge to main, check the files on GitHub's main branch. Click the connected
repository name and choose **Copy repository link**, then submit it separately
in Pika. Give your teacher access if it is
private. Zero does not submit assignments or change Pika grades.

## Publish a playable app

Use your own original project with Git **2.31+** and your own GitHub account.
**Run App** and test it, then choose **Publish app** from the arrow beside Run.
Publish saves open files, asks for a commit message when there are changes, and
commits and pushes before deploying. Already committed work is pushed without
another message; an already uploaded version goes straight to publication.
On a change branch, finish it with **Merge to main** first; Publish does not merge
or switch branches. Cancelling the commit message or a failed push stops deployment.
The first publish reviews the public Pages
destination, prepares publishing files, and uses the reviewed push flow.
If VS Code requests workflow permission, use the same GitHub account as Zero.
Enter a commit message if the setup files need to be committed; Zero then continues
publishing. The app and included assets will be
public; your source repository keeps its visibility. Later explicit Publish actions
revalidate and update that same approved site without another destination dialog.

Zero deploys the locally checked build. Wait for **App published**,
then choose **Open app** or **Copy playable link**. Later use **Zero: Open Published
App** or **Zero: Copy Playable Link** in the Command Palette. Choose Publish app
again to recheck a pending run; follow the stated next action if publication
fails. The previous live page remains available after an unsuccessful update.
The playable link is separate from your repository link for Pika.

**Share project** prepares a separate ZeroHub source submission. Zero attaches
a playable link only when it can verify the saved publication for that exact
pushed commit. ZeroHub's screenshot or Play tile opens the student-hosted app;
its version link opens the GitHub repository. Public managed library admission
remains gated; local Check is not public acceptance. Repository pushes, app
publication and ZeroHub submission remain separate explicit actions.

## Checking your changes

Run your app after each change. For the quiz, try both correct and incorrect answers.
Use the examples and exercises to check the behavior you changed. A compile
alone does not verify layout, focus or school-machine restrictions.

Zero maintainers keep the finite framework and example GUI checks in the
[Zero source repository](https://github.com/codepetca/zero). These contributor tools are separate from this student
project. Your normal Run App uses the project’s pinned Maven wrapper for JavaFX. If a
download fails, repair the connection and Run App again. Use **Show Problems**
for source errors; a failed build does not start an old build
as a successful new run.

Pinned native build dependencies: JavaFX **21.0.12**, Maven **3.9.11**,
official Apache Maven Wrapper **3.3.4** (only-script), JavaFX Maven plugin **0.0.8**, compiler plugin
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
