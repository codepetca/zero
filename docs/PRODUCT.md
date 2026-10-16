# Zero: local Java teaching MVP

## Outcome

A downloadable teaching kit for high school students who know beginning Java
through CodeHS. Students make interfaces, games, drawings, simulations and quizzes
using ordinary Java, then contribute understandable examples and helpers for
later cohorts. Students own their repositories; Pika submission is separate.

The download website is a separately built part of this repository. Its landing
page has the shared app header, **Learn Java**, **Starting from zero.**, and two
direct download buttons: **Download for Mac Silicon** and **Download for Windows
(ZIP)**. It uses the shared light/dark toggle and
centered full-viewport layout. The old `/get-started` address redirects to Downloads.
The website requires no GitHub sign-in. Download and launch desktop Zero first;
its welcome checks VS Code's existing GitHub connection, offers **Connect GitHub**
when needed, and then leads to creating a tutorial project. VS Code owns sign-in,
permission and credentials; no website OAuth or separate Zero account. Existing
connections show the username. Dismissing welcome leaves local Run available;
setup guidance remains accessible later. Publication and uploads remain explicit.
`/learn` opens lesson 0 directly in the tutorial reader. All thirteen lessons (0–12)
are listed under three quiet project headings (Greeting app, Study quiz and Coin
game); selecting one updates the reading pane and its bookmarkable
`/tutorials/[lesson]` URL. Narrow screens use a selector with the same groups.
Code blocks in tutorials, docs, source views and ZeroHub copy their exact text when
clicked, with a keyboard-accessible Copy button and success/failure feedback.
Dragging to select text keeps manual copying available.
`/downloads` is the separate platform download page;
Download is a regular top-menu page, and platform buttons do not appear below tutorials.
Docs opens the complete searchable Zero API directly; setup and longer app guides remain linked from its sidebar. Examples is a curated collection inside
ZeroHub, with actual app images, a description, Get project and a repository link.
ZeroHub’s New Project action opens the published GitHub starter template directly.
The starter details page remains available for ZIP downloads and setup instructions;
without published template metadata, New Project falls back to that page. Four
practice projects (Hello, Java; Study session; Collect the coins; Drawing pad)
are featured, with three advanced projects optional. The other nineteen entries
remain available through existing lesson/deep links rather than filling the
initial picker. Students build one feature at a time in their own repository;
GitHub/project workflow is part of the learning outcome. The primary distribution is five dedicated public GitHub template repositories.
Students use a template to create their own repository, then clone their own copy.
ZeroHub provides Use template, cloning instructions, a repository link and a
Download ZIP alternative. ZIP users create and connect an empty own repository. See [the course project guide](COURSE-PROJECT.md).
Each download is a complete runnable project with its Java, helpers, resources,
framework and Maven wrapper. Open it in Zero and Run App without copying individual
files. The top menu has no Examples entry; old Examples URLs forward to ZeroHub.
Docs and ZeroHub examples use sidebar navigation, narrow-screen selectors and
shared light/dark themes. Selection updates the content and bookmarkable URL.
Tutorials and Downloads use one circular sun/moon button in the header to switch
light/dark mode. The OS preference is the initial default; a chosen mode persists.
These pages fill the viewport width and at least its height; longer lessons scroll.
Downloads centers its heading and equal-width platform buttons in a vertical stack.
Concise platform/version requirements and a setup link appear below the buttons;
initial tutorial entries link to setup and explain creating a student-owned repository
from a template, then cloning that repository.
Share your work preserves the shared theme and appearance toggle.
Tutorial steps and reference sections are expanded by default; full guides remain
available. `/hub` is ZeroHub: discover separate editable games and reusable
libraries, inspect exact versions, source and verified GitHub contributor identity.
`/hub/share` explains native Zero Share commands and official GitHub forms.
Content pages use the navigation section name (Tutorials, Docs or ZeroHub)
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

`zero.App` is event-driven: `settings()` sets `title(...)` and initial
`size(...)` and optional `padding(...)` around the content; `setup()` creates JavaFX controls and calls `show(Node)`. Buttons,
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

`zero.GameApp` adds a fixed-size canvas and `update(seconds)` followed by
`draw()` each frame. Main explicitly updates and draws ordinary objects such as
Player or Mover. Canvas input belongs to the focused canvas; controls can receive
normal typing. The framework does not discover or automatically update objects.
While the canvas is focused, arrow presses stay with game input instead of moving
focus to a nearby control. Tab still moves focus to ordinary JavaFX controls;
arrows in a focused text field keep their normal caret behavior.
Useful startup errors explain invalid sizes and lifecycle misuse.

Local, unreleased `Sound` and `Music` helpers are available to both App and
GameApp. Load once with `loadSound` or `loadMusic`; short clips share a per-app
canonical-resource cache, while each music object has an independent buffered
player. Ordinary Java event handlers decide when to play/pause/stop/mute. App
shutdown, startup/frame failure and window closing release owned audio, including
when custom shutdown fails. Sky Hop and the separate audio playground demonstrate
reuse. Published core0.1.2 and released kit bytes remain unchanged.


Local, unreleased game helpers add `SpriteAnimation`, shared-pixel `ImageRegion`
views, one-frame press input, window focus, centered/rotated and vertically flipped
image drawing, centered text and `Collisions` geometry predicates. Animations
advance only through explicit `update(seconds)` calls. Images are cached per app;
independent animations share pixels. Physics, game states, scoring and obstacle
rules stay in ordinary student classes. Sky Hop and the optional sprite playground
exercise this contract; see [game systems](GAME-SYSTEMS.md). Published core0.1.2
and kit bytes are unchanged.


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

Start tutorial supplies only empty Main boilerplate and build/framework setup.
There are three scaffolds: Greeting (0–2), Study (3–7), Game (8–12). Website start
buttons appear at 0, 3 and 8; later pages say to continue the existing project.
Before lesson 0, students complete account/privacy setup: their own verified GitHub
account, Git 2.31+, school GitHub/VS Code/compilation access and teacher-approved
repository visibility/commit identity. Tutorial source can stay private with teacher
collaborator access; public game publishing remains optional. The visible
**Start tutorial** action on the welcome screen or Zero’s **…** menu opens the matching verified tutorial template. After creating their own repository, students choose
**Clone repository** in the repository menu; VS Code owns its URL/destination/opening controls.
Students create a repository in their own account, then clone their repository;
there is no local-folder or project-ZIP tutorial alternative. Completed teacher
checkpoints and optional references stay outside the empty template scaffolds. Lesson 12 optionally downloads only two
media resources; students may use their own assets or drawing fallback.
Click Run App again after editing: Zero saves, stops the previous process and
rebuilds. No normal lesson switching, source replacement or helper removal is needed.
Tutorial projects carry a tutorial identifier and repository-required marker,
normal Git ignores and enabled Git controls. Run and repository actions require
an existing standalone Git repository with a valid commit and GitHub origin;
cloning the shared teacher template directly is rejected. These are local teaching
checks, not cryptographic proof of a clone or online account ownership. Once cloned,
Run works offline without an active GitHub session. Upload, branch changes and
Publish use the ordinary live GitHub flow. ZeroHub contributions still require
separate original work; lesson11 keeps that distinction. Legacy local-only
projects retain their old protection. No student project is silently rewritten.

Canonical example sources live outside the starter's compiled source. ZeroHub
assembles each into a complete standalone project from an explicit file/resource
manifest. Tutorial exercises can still introduce source deliberately one lesson
at a time. See the [starter](../student-template/README.md) for those exercises.
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

Local, unreleased implementation: Run App targets the browser after local
compatibility checking and WebFX compilation. Students keep ordinary Java and
approved ordinary JavaFX APIs. Publish app stays in GitHub and deploys the same
validated local build; ZeroHub links to the student-hosted app. Cloud development
and hosted compilation are out of scope. A strict resolved-API gate rejects unsupported
application APIs before real WebFX compilation; see [browser builds](WEB-EXPORT.md).
Final integrated acceptance and release remain separate.

Browser sharing adds **Publish app** in the sidebar and **Export for
web** in the title menu. Students keep ordinary Java. A reviewed GitHub Pages
setup leads to an exact-version verified playable link. Live is the student
default; simulation is an explicit testing setting. Share game can attach the
exact verified publication automatically;
ZeroHub offers Play latest on student hosting alongside exact source downloads.
See [browser export](WEB-EXPORT.md) for the tested profile and limits.

- One continuous Zero view contains Run App, Stop, repository actions and Files,
  without extra GitHub/ZeroHub headings or a separate collapsible controls row.
  Idle status is empty; app progress/errors
  appear when there is a message. The account row shows Sign in or the clickable
  username. The repository menu stays visible, including an existing origin while
  signed out; it offers Clone repository, create/connect/open/copy and New branch
  or Switch branch as appropriate. The current branch stays visible. Commit & push
  and Merge to main remain direct actions. Simulation
  remains visibly labeled. ZeroHub offers Browse (project templates/examples on
  the website, or native library browsing) and signed-in Share project for original
  work. Tutorial repositories use GitHub normally but are not original ZeroHub contributions. Tutorials and Setup help live in the native view
  overflow; Copy repository link lives in the repository menu. Supported VS Code
  user controls can still move/hide views. There is no team/PR mode.
- Run saves files, checks ordinary Java against the supported browser API, builds
  locally when inputs changed and opens an owned browser preview. Re-running
  destroys the old runtime; Stop cancels builds and destroys the managed frame.
  Open in browser opens a local page around the same immutable compiled files in
  the default browser. Its liveness connection removes the app frame on Stop or
  rerun; a silent connection expires within4.5seconds while browser events run.
  Suspended or blocked browser execution can delay teardown. There is no hot
  reload. A native diagnostic command remains explicit.
- A tutorial repository opens its bundled Tutorials editor tab beside Main.java
  once when the editor is empty. Tutorials in the view menu or Command Palette
  reopens it; ordinary older-kit Markdown guides remain supported. All13 lessons,
  illustrations, code and linked Java references are bundled for offline reading.
  The tab retains the selected lesson, scroll and disclosures per project. It
  supports native floating windows and moves back into editor groups. Open in
  browser opens the current canonical lesson on the website; website navigation
  does not synchronize back into the editor. Start tutorial stays in welcome and
  overflow; Clone repository is in the repository menu. Neither lesson navigation nor opening
  a browser writes student Java, signs in, pushes or publishes anything.
- A run that exits with an error offers Show Problems for source navigation;
  successful exits and explicit Stop do not show an error. Missing local tools
  have setup help; GitHub sign-in does not block local running.
- Guided setup checks existing tools on personal and school laptops. Kit launchers
  offer explicit installation/help actions; the in-editor native Setup Help picker
  checks the process JDK/compiler, student files and current-profile Java
  extensions; relevant terminal environment overrides leave Run readiness unverified. Git is optional for original local apps; tutorial repositories require Git for their clone and local repository checks. Checks are read-only; repair/install
  and the first app run are student choices. No silent elevation, package-manager
  installation, credential configuration or policy bypass. See [setup](SETUP.md).
- Native setup wrappers embed the complete kit: a universal macOS app/DMG
  and a Windows EXE. They check tools, place a fresh writable folder and explicitly
  guide setup while preserving existing projects. Both flows use a small fixed
  window with one replacing status line and progress indicator, expose technical
  logs under Details only if setup fails, and
  prepare approved editor support in the background. Windows missing tools use
  vendor handoffs and profile import gets one instruction at a time. The ZIP
  launchers retain their manual menus.
  The published Mac0.5.14 native flow automatically prepares a private verified
  JDK21 and isolated Zero editor settings/extensions; compatible installed VS Code
  is reused or a verified private copy is downloaded. Manual profile import is
  removed from this Mac flow. Later editor choices and all student projects stay
  intact. Zero.app returns to this configured editor; ordinary VS Code
  profiles and Windows/ZIP setup remain separate.
  New Mac source from0.5.15 includes a signed automatic updater. After editor
  handoff, Zero checks when due and replaces only its app on quit; it does not
  terminate VS Code. Kit support prepares on the next launch, preserving the
  last project. Manual checks/settings are available in the Mac app menu and
  Command Palette. Existing0.5.14 needs one manual replacement to gain updating;
  school policies may still require administrator approval. A loaded extension
  may require a student-chosen editor reload; no forced reload is performed.
  Signed/notarized Mac0.5.14 is published; Windows remains a local unsigned
  development build. Native setup uses a `Zero` folder
  in the user’s home with no location/name picker. Current native source starts
  with Preparing Zero and automatically places or updates installer files while
  preserving the entire student project; an unrelated folder named Zero is
  refused. Mac0.5.12 automatically opens the editor once after
  final readiness verification, with an explicit retry if opening fails and no
  repeated launch on later checks. The first student app run remains a choice.
  Published Mac0.5.11 still offers Open Zero at completion.
  Previous Mac0.5.10 downloads retain their original Set up Zero and Update Zero
  confirmations.
  Published Mac0.5.14 ships a persistent Zero.app with an Applications shortcut
  on the DMG. Students drag Zero into Applications, open it for first preparation,
  and use that app to reopen the isolated editor later. Successful handoff closes
  the preparation window; healthy reopening verifies owned runtime/readiness and
  restores the saved editor session without kit copies or backups. Student work
  and later editor choices remain intact. The bundled guide is updated for13.
  See [native setup](INSTALLER.md).
- An optional settings-only profile defaults to light with 500 ms autosave;
  the sidebar also supports dark themes. Import the profile before installing
  the local VSIX and Java extensions in it. The standard build shortcut runs
  the app; optional F6/F7 bindings stay separate.

Routine Git, publishing, export and library results appear in the sidebar's live
status and Zero Output, without success notifications. Routine status uses short
results such as “Pushed to main”, “Merged to main” and “Export ready”; commit
hashes, sizes and longer guidance stay in Zero Output. Verified published apps
keep Open app/Copy playable link actions in the sidebar; completed exports keep
Preview export/Save ZIP/Share export actions there. Errors, warnings, required
choices and the first-publication warning remain visible through native prompts.

## Repository and upload contract

Students sign in through VS Code's native GitHub authentication/browser flow.
Zero shows the selected account username in the sidebar. Clicking it offers Change GitHub Account and Sign out; Sign out opens
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

`zero.uploadMode` defaults to `live`. Nothing uploads or publishes on activation,
sign-in or connection alone. First/new-destination Publish shows a short warning
that the app and included assets will be public;
later explicit Publish actions revalidate and update that approved site without
another destination dialog. Publishing setup continues through its upload without
a second publish confirmation. Commit & push saves files and shows the repository
and branch with the commit-message input; submitting the message proceeds directly.
It validates and stages the captured changes, commits when needed and pushes the
captured destination/SHA,
then checks the remote branch before reporting success. A failed push can leave
a local commit. Ordinary per-repository Git name/email identity is configured
manually; signing in does not configure commit identity. Optional explicit
`simulation` remains available for maintainer/teacher testing: Commit & push,
New branch, Merge to main and Publish simulate without saving files or performing
Git/network actions.
Tutorial repositories use the same GitHub workflow; only legacy local-only markers remain blocked.

The individual flow uses main for completed work and one short-lived branch per
change. A new empty repository starts with Commit & push on main.
Choose New branch in the repository menu and enter its name to create it directly. New branch
requires clean committed main and brings in remote main only by fast-forward;
diverged histories require manual repair. Commit & push commits/pushes progress
to the current branch. Run and check the app before finishing.

Click Merge to main beside the change branch. Commit & push pending edits first.
Merge to main runs directly from its button and requires a clean committed change
branch. Account, destination and source snapshots are checked before execution. Updated remote main is merged into the change
branch, then the action pauses for Run App and another Merge to main review before
pushing the combined version. No rebase/force push is used. Conflicts preserve the branch and merge
state, open native Source Control and require resolution/staging/commit before
running the app and reviewing Merge to main again. Local main may not contain separate
unpublished work outside the change branch. The action advances local main, pushes
the exact completed SHA to remote main and confirms it before switching to main.
A failed push can leave main advanced locally while retaining the change branch
for another Finish review. After confirmed success, cleanup automatically removes
only the unchanged local finished branch. If its safety checks fail, main stays
completed and the local branch is kept with a concise notice and Zero Output
details. The uploaded remote change branch remains. Shared worktrees and
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
