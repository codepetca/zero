# Zero: local prototype

## Outcome

A downloadable teaching kit for high school students who know beginning Java
through CodeHS. Students make games, drawings, simulations and quizzes using
ordinary Java, then contribute understandable examples and helpers for later
cohorts. Students own their repositories; Pika submission is a separate action.

## Current scope

- JavaFX Canvas with a tiny `zero.SimpleApp` lifecycle, basic drawing and input
  helpers. Main explicitly updates/draws ordinary objects such as Player.
- A follow-the-mouse starter plus keyboard, counter and drawing alternatives.
  Examples live outside compiled source and are copied deliberately one at a time.
- A minimal VS Code sidebar: Run App, Stop, Upload to GitHub, repository status,
  Connect Repository, Copy Repository Link, Setup help and a simple files tree.
- Run saves files, cleans/compiles and opens a separate native JavaFX window.
  Re-running rebuilds/restarts; Stop terminates the owned run. No hot reload.
- Source navigation from compiler diagnostics and setup checks for local tools.
  GitHub authentication does not block local running.
- A settings-only light profile with 500 ms autosave. Import it before installing
  the local Zero VSIX and Java extensions. Standard build shortcut runs the app;
  optional F6/F7 bindings stay separate.

## Repository and upload contract

Connect accepts ordinary GitHub HTTPS repository URLs. It initializes/adds
origin only in the exact standalone student Git root, with confirmation before
replacing origin. It rejects nested projects and does not change account
credentials. Connection does not verify remote ownership, existence or sign-in.
Students create their own empty repository; there is no GitHub Classroom flow.

`zero.uploadMode` defaults to `simulation`, which makes no Git changes and says
nothing was uploaded. Opt-in `live` mode saves files, gathers a commit message
and shows a modal review of repository, branch and changed files. After user
confirmation it stages reviewed changes, commits when needed and pushes with
normal Git HTTPS transport. It checks the remote branch before reporting success.
Git identity and credentials must be configured through standard Git tooling;
Zero has no custom password/token UI. A failed push can leave a local commit.

Copy Repository Link returns a page URL for separate submission in Pika. It does
not submit an assignment or alter a grade.

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

The readable framework source remains bundled. Native JavaFX controls are
available through `layout()`. Prefer a focused helper or example over a larger
engine, and review contributions before a cohort adopts them.

## Verification limits

Mac builds, finite GUI smoke, examples and interactive profile/sidebar checks
have evidence in [VERIFICATION.md](VERIFICATION.md). Tests intercept Git
transport; they do not establish actual GitHub authentication/upload. Physical
Windows/Linux, student restrictions and classroom pilots still need verification.
First-time builds need internet for Maven/JavaFX. This is not a classroom-ready
release; versioned library distribution is future work.
