# Zero: local Java teaching MVP

## Outcome

A downloadable teaching kit for high school students who know beginning Java
through CodeHS. Students make interfaces, games, drawings, simulations and quizzes
using ordinary Java, then contribute understandable examples and helpers for
later cohorts. Students own their repositories; Pika submission is separate.

## App and learning contract

`zero.SimpleApp` is event-driven: `settings()` sets `title(...)` and initial
`size(...)`; `setup()` creates JavaFX controls and calls `show(Node)`. Buttons,
labels, text fields and layouts keep their ordinary JavaFX names and behavior.
The default app is a small quiz with answer feedback and score state.

`zero.SketchApp` adds a fixed-size canvas and `update(seconds)` followed by
`draw()` each frame. Main explicitly updates and draws ordinary objects such as
Player or Mover. Canvas input belongs to the focused canvas; controls can receive
normal typing. The framework does not discover or automatically update objects.
Useful startup errors explain invalid sizes and lifecycle misuse.

The quiz and practice tracker reuse the canonical
`examples/shared/ScoreDisplay.java` unchanged. Each app creates its own instance;
a JavaFX node has one parent. The caption exercise extends this ordinary class
while preserving the quiz's no-argument constructor. No component/screen base
class, registration system or new engine is required. Packages, interfaces,
JavaFX properties and other JavaFX features remain available as later lessons.

Examples live outside compiled source and are copied deliberately one at a time.
See the [starter](../student-template/README.md) for exact files and exercises.
Framework source ships editable inside the starter. Review shared improvements
in more than one app before cohort adoption; versioned library distribution is
future work.

## Editor workflow

- A minimal VS Code sidebar offers Run App, Stop, GitHub account/repository status,
  sign-in, repository creation/connection, upload, copy link, setup help and files.
- Run saves files, cleans/compiles and opens a separate native JavaFX window.
  Re-running rebuilds/restarts; Stop terminates the owned run. There is no hot reload.
- Compiler diagnostics support source navigation. Missing local tools have setup
  help; GitHub sign-in does not block local running.
- An optional settings-only profile defaults to light with 500 ms autosave;
  the sidebar also supports dark themes. Import the profile before installing
  the local VSIX and Java extensions in it. The standard build shortcut runs
  the app; optional F6/F7 bindings stay separate.

## Repository and upload contract

Students sign in through VS Code's native GitHub authentication/browser flow.
Zero displays the selected account. Create Repository opens GitHub's new-repository
page; students create their own empty repository following teacher visibility
instructions, leaving README, license and gitignore uninitialized. There is no
GitHub Classroom flow and no automatic repository creation.

Connect accepts ordinary GitHub HTTPS repository URLs. It initializes/adds
origin only in the exact standalone student Git root, with confirmation before
replacing origin. It rejects nested projects. Connection is local: it does not
verify remote ownership, existence or access and does not upload.

`zero.uploadMode` defaults to `simulation`, which makes no Git changes and says
nothing was uploaded. Opt-in `live` mode saves files, gathers a commit message
and reviews repository, branch and changed files before confirmation. It stages
reviewed changes, commits when needed and pushes the reviewed destination/SHA,
then checks the remote branch before reporting success. A failed push can leave
a local commit. Ordinary per-repository Git name/email identity is configured
manually; signing in does not configure commit identity.

Live transport uses transient credentials from the captured native GitHub session.
It requires Git 2.31+ for runtime credential configuration and rejects older Git
before credential dispatch.
The session is revalidated before network actions, so account/session changes
require another review. Zero does not store tokens or place them in Git command
arguments or logs. It has no custom password/token UI. Automated checks mock
sessions and intercept transport; they do not prove a real upload.

Copy Repository Link returns a page URL for separate Pika submission. A copied
link does not establish that code was uploaded or that the remote is current.
Verify files after a real upload, then submit the link separately in Pika.

## Integration contract

`zero.json` marks a student project in the workspace root, or its
`student-template/` child for kit development. The project includes `mvnw`,
`mvnw.cmd`, `pom.xml` and `.vscode/tasks.json`. Run executes the wrapper with
`clean compile javafx:run` in that project. Cleaning avoids stale classes from
the Java language server. Arguments are passed separately from untrusted text.

The default build task has type `zero`, task `run` and matcher `$zero-java`.
The extension TaskProvider owns sidebar and shortcut runs. A separate wrapper
task supports running without Zero. Java language diagnostics require
`redhat.java`; `vscjava.vscode-java-debug` supplies Java debugging support.
The starter targets Java 17, uses pinned JavaFX 21.0.12 and needs a supported
JDK 17+ for builds. JDK 17 was tested; editor runtime requirements may differ.

## Verification and distribution limits

See [VERIFICATION.md](VERIFICATION.md) for actual local checks and their scope.
A Mac teacher trial verified native authentication and a private repository
upload. Physical Windows/Linux, school restrictions and novice classroom pilots
still need verification. First-time builds need
internet for Maven/JavaFX. Use the [pilot checklist](CLASSROOM-PILOT.md) before
cohort adoption. A public license for original Zero code remains unresolved;
upstream wrapper notices apply to the wrapper.
