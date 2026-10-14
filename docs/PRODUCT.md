# Zero: local Java teaching MVP

## Outcome

A downloadable teaching kit for high school students who know beginning Java
through CodeHS. Students make interfaces, games, drawings, simulations and quizzes
using ordinary Java, then contribute understandable examples and helpers for
later cohorts. Students own their repositories; Pika submission is separate.

The download website is a separately built part of this repository. Its landing
page has the shared app header, **Learn Java**, **Starting from zero.**, and two
stacked buttons: **Download Zero** opens `/downloads`; **Start Learning** opens
`/learn`. It uses the shared light/dark toggle and centered full-viewport layout.
`/learn` opens lesson 0 directly in the tutorial reader. All thirteen lessons (0–12)
are listed in the desktop sidebar; selecting one updates the reading pane and its
bookmarkable `/tutorials/[lesson]` URL. Narrow screens use a lesson selector. `/downloads` is the separate platform download page;
Download is a regular top-menu page, and platform buttons do not appear below tutorials.
Tutorials and Downloads use one circular sun/moon button in the header to switch
light/dark mode. The OS preference is the initial default; a chosen mode persists.
These pages fill the viewport width and at least its height; longer lessons scroll.
Downloads centers its heading and equal-width platform buttons in a vertical stack.
Tutorial steps and reference sections expand when requested; full guides remain
available. `/hub` is ZeroHub: discover separate editable games and reusable
libraries, inspect exact versions, source and verified GitHub contributor identity.
`/hub/share` explains native Zero Share commands and official GitHub forms.
Content pages use the navigation section name (Tutorials, Docs, Examples or ZeroHub)
as the large main heading and the page topic beneath it as a muted subtitle.
Purple eyebrow labels and back controls are removed; top navigation, reader
sidebars and Next lesson remain available. Hub browsing/downloads are public;
its Sign in to GitHub and Create GitHub account buttons open GitHub's official
pages in a new browser tab, without creating a Hub session or detecting account state.
Contribution instructions explicitly require GitHub sign-in in Zero and the same
personal account for the browser publication form. The
local replacement has no website sign-in, reservation or folder-upload service.
Public publication remains inactive; library candidate execution still needs its
outstanding acceptance. Existing kit/installer downloads have separate release records.
See [repository boundaries](ARCHITECTURE.md) and [website plan](WEBSITE-PLAN.md).

## App and learning contract

`zero.SimpleApp` is event-driven: `settings()` sets `title(...)` and initial
`size(...)`; `setup()` creates JavaFX controls and calls `show(Node)`. Buttons,
labels, text fields and layouts keep their ordinary JavaFX names and behavior.
The installed kit's default app shows Hello, world!; the learning projects start
with empty runnable boilerplate. Lessons 0–2 grow one Greeting app from label to
button to name input. Lessons 3–7 grow one Study quiz: answer feedback, attempts,
reset methods, a Counter object, then Question objects/arrays and scoring. Lessons
8–12 grow one Coin game with student-authored Player/Coin, win/restart, ScoreDisplay
reuse, and optional media/scrolling. Lesson 10 reopens Study and Game to extract and
reuse the student's display class. Lesson 11 practises compatible changes locally;
sharing uses a separate original project. Lesson 12's platform/level/endings stages
are optional continuations of the same game, with maintained references; see
[game systems](GAME-SYSTEMS.md).
The scored quiz remains a later reuse example.
The new local tutorial pass inserts one-coin native controls before arrays/win,
then reuses unchanged ScoreDisplay in the study app and coin game.
[UI and flow](../student-template/UI.md) explains controls/components in sketches;
[the teaching plan](TUTORIAL-PLAN.md) distinguishes current conventions from proposed
welcome/result/countdown helpers. These sources remain unreleased; published kits
keep their original bytes.
The later local visual pass gives all thirteen lessons an always-visible target
illustration, three actions and one checkpoint before detailed code. Optional
composed-study/composed-game examples now demonstrate the same ordinary StartScreen
and Hud classes in both app types. These are source examples, not core APIs or
ZeroHub releases. Pause remains planned. Maintained bundles now live in `libraries/`, with real JAR consumers; see [the local package proof](STARTER-UI-PACKAGE.md).

`zero.SketchApp` adds a fixed-size canvas and `update(seconds)` followed by
`draw()` each frame. Main explicitly updates and draws ordinary objects such as
Player or Mover. Canvas input belongs to the focused canvas; controls can receive
normal typing. The framework does not discover or automatically update objects.
While the canvas is focused, arrow presses stay with game input instead of moving
focus to a nearby control. Tab still moves focus to ordinary JavaFX controls;
arrows in a focused text field keep their normal caret behavior.
Useful startup errors explain invalid sizes and lifecycle misuse.

The scored quiz and practice tracker reuse the canonical
`examples/shared/ScoreDisplay.java` unchanged. Each app creates its own instance;
a JavaFX node has one parent. The optional caption extends this ordinary class
while preserving the quiz's no-argument constructor. This compatible caption
contribution now ships in the shared component and the tracker uses “Completed”.
A separate study app grows the quiz with an array of ordinary Question objects,
answer feedback, score, next/restart and a final summary. It reuses the same
ScoreDisplay source. No component/screen base
class, registration system or new engine is required. Packages, interfaces,
JavaFX properties and other JavaFX features remain available as later lessons.

Start project supplies only empty Main boilerplate and build/framework setup.
There are three scaffolds: Greeting (0–2), Study (3–7), Game (8–12). Website start
buttons appear at 0, 3 and 8; later pages say to continue the existing project.
The native Start project command chooses a new folder and opens a separate window;
existing projects are never replaced. Completed teacher checkpoints and optional
references stay outside scaffold ZIPs. Lesson 12 optionally downloads only two
media resources; students may use their own assets or drawing fallback.
Click Run App again after editing: Zero saves, stops the previous process and
rebuilds. No normal lesson switching, source replacement or helper removal is needed.
Practice projects have a local-only marker, ignore every file in Git, disable
workspace Git and reject Zero repository/upload/sharing actions. Native creation
rejects existing destinations and Git parent folders. They have no GitHub repository
or server-side student state. Students can create a separate original project for
coursework/sharing; lesson 11 keeps those paths explicit.
Canonical framework source lives in `framework/src/main/java/zero/`; maintainer
preparation assembles editable copies into the standalone starter. Review shared improvements
in more than one app before cohort adoption. The extraction examples remain useful
lessons; shared components now use the local ZeroHub versioned-library flow.

ZeroHub uses one existing public game repository owned by the student's personal
GitHub account. Optional libraries live in `libraries/<name>/` in that same
repository. Share game freezes the root project; Share library freezes its
committed folder and exact version. Native Zero controls reuse authored
`zero-game.json`/`zero-library.json` settings, derive identity, preview source and
open the official GitHub form. Normal Git upload and separate Pika submission
remain unchanged. Local changes after the selected commit are not part of a request.

Games are complete editable projects opened separately into new destinations,
never library dependencies. Downloaded Java is not automatically run; ordinary
VS Code workspace trust and Run App remain student choices. Game packaging checks
do not promise safe execution, gameplay quality or native installers.

Libraries use exact Maven pins with deliberate Add, Update and Revert. Widgets
and ordinary helpers retain ordinary Java APIs; Main explicitly owns state and
updates. Develop local library and Use published version are distinct modes.
Check library supplies local compilation/API/behavior/two-consumer feedback;
local feedback is not public acceptance. Trusted checking and a separate publisher
are the intended automatic publication path, without routine maintainer approval,
but the unresolved library checker acceptance gate remains binding.

The replacement uses a Git CAS registry ledger and immutable public Blob artifacts
with generated catalog snapshots, not Neon or website OAuth. Accepted versions
never change source. ZeroHub keeps contributions open without lifetime contributor
storage or library-count allowances; technical bounds and shared capacity controls
remain. Owners and designated maintainers retain curation/withdrawal authority.
See [component architecture](COMPONENTS.md), [the adoption plan](GITHUB-SHARING-PLAN.md)
and [the contribution policy](ZEROHUB-POLICY.md).

The first dogfooding pass deliberately uses the existing framework. App-specific
navigation and question rules stay in Main; Question stores question data and
ScoreDisplay presents the app-owned total. Add framework API only when another
app demonstrates a shared need. See [the dogfooding record](DOGFOODING.md).

## Editor workflow

- A minimal VS Code sidebar offers Run App, Stop, files and setup help. GitHub's
  header has a profile icon (account initial when signed in); hover reveals the
  account name and click opens account actions. The repository row shows
  owner/name or “Connect a repo”; its menu offers create/connect or copy/change.
  The current branch opens Start a change (on main) or Finish change (on a change
  branch). Upload changes and its simulation label stay visible for a signed-in
  connected repo. There is one individual workflow; no team/PR mode.
- Run saves files, cleans/compiles and opens a separate native JavaFX window.
  Re-running rebuilds/restarts; Stop terminates the owned run. There is no hot reload.
- The first lesson opens once per project when the editor is empty; Open First
  Lesson in the sidebar or Command Palette reopens it. Existing projects without lessons still run.
- A run that exits with an error offers Show Problems for source navigation;
  successful exits and explicit Stop do not show an error. Missing local tools
  have setup help; GitHub sign-in does not block local running.
- Guided setup checks existing tools on personal and school laptops. Kit launchers
  offer explicit installation/help actions; the in-editor native Setup Help picker
  checks the process JDK/compiler, student files and current-profile Java
  extensions; relevant terminal environment overrides leave Run readiness unverified. Git is optional for local Run. Checks are read-only; repair/install
  and the first app run are student choices. No silent elevation, package-manager
  installation, credential configuration or policy bypass. See [setup](SETUP.md).
- Native setup wrappers embed the complete kit: a universal macOS app/DMG
  and a Windows EXE. They check tools, place a fresh writable folder and explicitly
  guide setup while preserving existing projects. Both flows use a small fixed
  window with one replacing status line, hide technical logs under Details and
  prepare approved editor support in the background. Windows missing tools use
  vendor handoffs and profile import gets one instruction at a time. The ZIP
  launchers retain their manual menus.
  The published Mac0.5.9 native flow automatically prepares a private verified
  JDK21 and isolated Zero editor settings/extensions; compatible installed VS Code
  is reused or a verified private copy is downloaded. Manual profile import is
  removed from this Mac flow. Later editor choices and all student projects stay
  intact. Open Zero.command returns to this configured editor; ordinary VS Code
  profiles and Windows/ZIP setup remain separate.
  Signed/notarized Mac0.5.9 is published; Windows remains a local unsigned
  development build. Native setup uses a `Zero` folder
  in the user’s home with no location/name picker. Re-running setup confirms an
  update of installer files while preserving the entire student project; an
  unrelated folder named Zero is refused.
  See [native setup](INSTALLER.md).
- An optional settings-only profile defaults to light with 500 ms autosave;
  the sidebar also supports dark themes. Import the profile before installing
  the local VSIX and Java extensions in it. The standard build shortcut runs
  the app; optional F6/F7 bindings stay separate.

## Repository and upload contract

Students sign in through VS Code's native GitHub authentication/browser flow.
Zero identifies the selected account through the initial's hover/accessibility
label. Clicking it offers Change GitHub Account and Sign out; Sign out opens
VS Code's native Manage Accounts picker (or manual Accounts instructions on
older editors), where the user chooses their GitHub account
and signs out. Session changes still invalidate pending upload reviews. Zero has
no custom logout/token deletion. Connect a repo → Create a repository opens GitHub's new-repository
page; students create their own empty repository following teacher visibility
instructions, leaving README, license and gitignore uninitialized. There is no
GitHub Classroom flow and no automatic repository creation.

Connect accepts ordinary GitHub HTTPS repository URLs. It initializes/adds
origin only in the exact standalone student Git root, with confirmation before
replacing origin. It rejects nested projects. Connection is local: it does not
verify remote ownership, existence or access and does not upload.

`zero.uploadMode` defaults to `simulation`, which makes no Git changes and says
nothing was uploaded. Start/Finish also simulate without saving files or changing
branches. Opt-in `live` mode saves files, gathers a commit message
and reviews repository, branch and changed files before confirmation. It stages
reviewed changes, commits when needed and pushes the reviewed destination/SHA,
then checks the remote branch before reporting success. A failed push can leave
a local commit. Ordinary per-repository Git name/email identity is configured
manually; signing in does not configure commit identity.

The individual flow uses main for completed work and one short-lived branch per
change. A new empty repository starts with a reviewed Upload changes on main.
Click main → Start a change, name the branch, and review its creation. Start
requires clean committed main and brings in remote main only by fast-forward;
diverged histories require manual repair. Upload changes commits/pushes progress
to the current branch. Run and check the app before finishing.

Click the change branch → Finish change. Upload pending edits first; Finish
requires a clean committed change branch and previews the branch, destination,
main snapshots and affected paths. Updated remote main is merged into the change
branch, then Finish pauses for Run App and another Finish review before uploading
the combined version. No rebase/force push is used. Conflicts preserve the branch and merge
state, open native Source Control and require resolution/staging/commit before
running the app and reviewing Finish again. Local main may not contain separate
unpublished work outside the change branch. Finish advances local main, pushes
the exact completed SHA to remote main and confirms it before switching to main.
A failed push can leave main advanced locally while retaining the change branch
for another Finish review. Optional cleanup removes only the unchanged local
finished branch; the uploaded remote change branch remains. Shared worktrees and
unusual histories require normal Git tools. No automatic source rollback occurs.

Live transport uses transient credentials from the captured native GitHub session.
It requires Git 2.31+ for runtime credential configuration and rejects older Git
before credential dispatch.
The session is revalidated before network actions, so account/session changes
require another review. Zero does not store tokens or place them in Git command
arguments or logs. It has no custom password/token UI. Automated checks mock
sessions and intercept transport; they do not prove a real upload.
The same guarded transport permits only exact-destination pushes, branch-head
queries and SHA-pinned fetches needed to update main. Local Git receives no native
credentials. Preparation queries remote main without changing local files/refs;
the reviewed executor performs updates, with drift/session checks throughout.

Copy Repository Link returns a page URL for separate Pika submission. A copied
link does not establish that code was uploaded or that the remote is current.
After Finish, verify completed files on main after a real upload, then submit the
link separately in Pika. A branch upload alone does not finish a change on main.

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
upload. The current MVP targets Mac with Apple Silicon and Windows; Linux and
Intel Macs are unsupported. Windows uses the published complete-kit ZIP for
manual setup; its native EXE remains unpublished. Physical Windows, school
restrictions and novice classroom pilots still need verification. Retained
universal/cross-platform artifacts and historical checks do not expand support.
First-time builds need internet for Maven/JavaFX. Use the [pilot checklist](CLASSROOM-PILOT.md) before
cohort adoption. Original Zero code uses the [MIT license](../LICENSE);
upstream wrapper notices apply separately to the wrapper.


## ZeroHub alternatives and core promotion

Multiple component libraries can coexist. Related classes share a library and
exact version; individual classes remain discoverable. Verified numeric GitHub
repository IDs and permanent slugs determine stable identities: repository 12345
and `health-bar` yield `lib-r12345-health-bar`, imports such as
`zero.contrib.r12345.health_bar.HealthBar` and Maven coordinate
`ca.codepet.zero.contrib.r12345:health-bar:0.1.0`. Account/repository renames do not
change packages or coordinates. Contributor credit follows verified GitHub identity.
No automatic updates, package renames or merging of alternatives.

Preferred choices and promotion into core remain deliberate future decisions
based on usefulness, API stability and maintenance. They do not change installed
pins. See [the adoption plan](GITHUB-SHARING-PLAN.md) and
[single-repo boundaries](ARCHITECTURE.md).
