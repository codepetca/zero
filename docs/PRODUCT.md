# Zero: local Java teaching MVP

## Outcome

Maintainers iterate locally through [Zero Dev](ZERO-DEV.md): a separate source
extension host, a playable Coin Game using current framework sources, a live
component preview and finite smoke checks. This development loop does not require
an installer rebuild or change installed student Zero; distribution and native
installation/update acceptance remain separate release steps.

A downloadable teaching kit for high school students who know beginning Java
through CodeHS. Students make interfaces, games, drawings, simulations and quizzes
using ordinary Java, then contribute understandable examples and helpers for
later cohorts. Students own their repositories; Pika submission is separate.

Success means a student can start their own tutorial repository, make and explain
a small Java change, run it, repair a useful compiler error, and save their work
to GitHub. The default teaching path must also produce working games and apps
through the pinned JavaFX/WebFX toolchain, playable on GitHub Pages. An individual
early lesson need not publish, but browser delivery is a core product capability.
Keep ordinary Java and explicit ownership of updates central as the kit grows.

Owner clarification,2026-10-23: normal student games/apps should use Zero packages
almost entirely. Zero provides the common controls, layouts, drawing, input,
assets and app/game lifecycle, using JavaFX underneath. Direct JavaFX remains an
advanced supported-subset escape hatch. The target
[class model](FRAMEWORK-MODEL.md) keeps App as the common UI host and GameApp
extending App as the single gameplay owner. Optional UI Screens provide menus/
results; optional Worlds organize actors. There is no public GameScreen. Main
keeps update/draw, can swap level controllers, and can add live HUD/controls
without navigating away; showing a replacement UI Screen suspends gameplay.
The starter and Greeting, Study and Coin lessons now use Zero packages locally.
Released templates remain separately pinned.
New Start tutorial now rejects missing/stale recorded template source evidence
before creating a repository. The three public templates were updated through
reviewed PRs and verified from anonymous public archives on2026-10-24. Their
recorded commits/trees/digests match the current helpers and project-owned builder.
Existing projects can Open/Clone/Run without upgrading.
The gate does not verify mutable remote contents or change direct GitHub links.

Catch framework/platform failures automatically: per-signature native/WebFX/browser
evidence, early compatibility diagnostics, actual compiler/behavior gates and
truthful runtime error state. The [reliability plan](FRAMEWORK-RELIABILITY.md)
evaluates PostHog for optional structured operational signals and Clarity for
supplementary website usability. Neither replaces compiler/tests or automatically
instruments student-owned sites. No new collector or analytics deployment exists.

Project longevity, owner direction 2026-10-23: the student's repository owns its
framework source, native/browser build files, Zero-specific build tooling, version
records and exact dependencies. Editor updates never upgrade them automatically.
No required central historical-kit storage, database or kit registry. Maintain the
current release line without old-version branches/backports. Stable same-major
releases preserve the documented API; upgrades remain optional/reversible. Keep
editable source and a retained finished web build. Full offline backups are
optional and student-retained; default future rebuilds depend on usable tools
and availability of normal dependency hosts, not a promise of permanent support.
See the [versioning and preservation policy](FRAMEWORK-ARCHITECTURE.md#project-versions-and-preservation)
for current gaps, experimental 0.x rules and bounded clone/build/rehost acceptance.
Project-owned browser tooling and complete locks are implemented locally. The
old/new clone, rebuild, static rehost and reversible upgrade proof passes locally.

Implementation execution, owner-authorized 2026-10-23: follow the single
[phased delivery roadmap](FRAMEWORK-ARCHITECTURE.md#phased-delivery-and-acceptance).
The first accepted local slice moves Greeting lessons0–2 and the starter to Zero
UI, adding only the TextField needed by that teaching path. Study lessons3–7 are also accepted locally, with inherited control availability
verified in the pinned browser runtime. Coin lessons8–9 are accepted locally with Zero Key and Row; shared ScoreDisplay
lessons10–11 are accepted locally. Lesson12 Zero image/sound and scrolling are accepted locally; a live-control
simulation is accepted locally. Phase1 is complete. Phase2A–C are accepted locally: interchangeable student-owned
views, actual core-dependent managed component reuse and replaceable actor
animation/steering. Core now has18 helpers/183 declarations. Optional container
replacement is also accepted locally, completing Phase2. Project-owned browser
tooling and trusted editor selection are accepted locally through05390785; the
full old/new preservation proof also passes locally. Local prototypes and
verification are separate from released kits and published tutorial repositories.

Local reliability gates pass through eef9960c: all183 declarations have current
executed native and browser evidence,366/366 targets with no gaps. Seven actual
native suites, four pinned WebFX exports and the scoped browser behavior/failure
checks pass. UI callback and startup failures preserve their causes and stop the
browser game. The refreshed local kit candidate passes archive/source/license
and extracted Maven checks. The later actual isolated Mac editor walkthrough
exercises class/asset editing, compiler correction, native readiness, browser play,
component replacement and local Git/ZIP saving. The host runtime scan accepts
bounded macOS hard-linked Java launchers. The saved checker and library workflows
recognize exact core source without relaxing student/library namespace protection.
The actual editor now passes compatible → unsaved stale → unsupported source-linked
Problems → corrected compatible, and native Run remains usable. Current local
Check Library builds an independent ScoreView JAR and runs its checks and both
examples; full WebFX export with that component and its bar HUD also pass.
151 focused tests and targeted independent review pass through eef9960c.
Native physical play, installation, physical Windows, novice use, authenticated
GitHub/hosted sharing and publication remain separately unproven. Local completion
is distinct from release and live-service acceptance.

## Basic game completeness pass

The local [three-game pass](BASIC-GAMES.md) adds Zero/standard-Java-only Pong,
a collector/shooter and a fixed-screen platformer. Movement/action key constants
and primary pointer overloads remove the demonstrated input enum gaps. The core
now declares 193 public/protected entries; prior 183/366 evidence above belongs to
its earlier exact revision. Current scoped input and game behavior proof is
recorded separately in EVIDENCE. This does not publish or release the framework.

The tutorial remains three small continuing projects: Greeting (0–2), Study
(3–7), Coin (8–12). Intermediate lesson 10 explicitly refactors Main into a
student-owned PlayerInput helper and the existing reusable ScoreDisplay. Lesson
11 checks a compatible improvement, optionally adds WASD, and practises sharing a
small CreditsBadge in a separate Tutorial practice area. An original community/core
contribution proposal remains an optional extension. Lesson 12 keeps optional media/scrolling;
larger reference games remain maintainer completeness checks. No new core Input
class or required fourth tutorial project is introduced. Submitting practice work
is explicit and remains gated by hosted library acceptance.

## ZeroJams

ZeroJams supports planned Game Jam and App Jam events. Any user can propose an
event for Zero maintainer approval. Zero supplies the complete versioned website
template; creators keep an independent copy in their own repository and host it
themselves. A shared Zero-owned panel/service handles official joining and project
submission through GitHub-backed records. Zero owns approval, accepted rules and
moderation; creator websites and participant demos remain independently hosted.
Every Game Jam and App Jam requires students to use GitHub: sign in on Zero to
join and submit their own public GitHub repository at an exact commit. This
platform requirement is separate from creator eligibility rules. Browsing and
site preparation remain available before sign-in.
ZeroJams has an owner-authorized, protected preview for creator stewchan and
independent approver armorup. Both GitHub sign-ins and their separate roles are
verified. Production pages, panels, APIs, template downloads and navigation remain
hidden under the owner hold. Editor shortcuts are deferred until the public
product is ready. Full event lifecycle and provider-cost acceptance remain pending. See the
[phased plan](ZEROJAMS-PLAN.md) and [operator guide](ZEROJAMS-OPERATIONS.md).

## Core goal: students grow the framework

Owner direction,2026-10-23: students should learn to build, extend and improve
software together, rather than only consume a fixed game API. The learning loop
is **build → extract → share → reuse → improve → propose for core**. A student
can implement a missing steering method, replace animation playback, or share a
HUD, camera behaviour or larger structure as understandable Java through ZeroHub.
The architecture must provide public seams for those contributions without
editing canonical framework source or relying on private runtime internals.

Students keep their own GitHub repositories and exact-version library choices.
Alternatives can coexist; popularity does not automatically promote an API into
Zero. Demonstrated reuse, clear teaching value, native and WebFX/browser evidence,
attribution and deliberate maintainer review make an idea a core candidate.
Accepted artifacts and existing pins remain immutable; adoption into core does
not silently replace installed libraries. Contributing is a core learning goal,
not a requirement to publish every beginner exercise or activate unaccepted
hosted checking. The [framework architecture plan](FRAMEWORK-ARCHITECTURE.md)
defines the proposed ownership, replacement contracts and acceptance examples;
[ZeroHub components](COMPONENTS.md) defines the existing sharing flow and limits.

## Current delivery

Mac 0.5.43 includes a split Run control: the main button runs locally and its
arrow opens **Publish app** for connected, ready projects. Stop the app before
publishing; the arrow is unavailable while running or stopping.

Current delivery, checked 2026-10-21: Mac 0.5.43 ships native Explorer and the teaching New dropdown, native Run App, Start Page sign-in
and GitHub setup. Windows remains the unsigned 0.5.21
preview and matching manual ZIP, with updates disabled and physical acceptance
pending. The general manual kit fallback remains 0.5.17. Source availability,
released versions and observed student/provider acceptance are separate; see
[the goal audit](VERIFICATION.md#goal-and-gap-audit--2026-10-19).
GitHub setup verifies project access before tutorial choices and repository details.

The shared Zero brand uses the softened, thicker slashed-circle mark from
`design/brand`. Website title images use purple in light mode and light purple on a transparent
background in dark mode, with lowercase outlined lettering. Every website browser tab
reads lowercase **zero**, with a transparent favicon matching the page's light/dark
icon color. Apple touch icons and share previews keep the white-on-purple inverse.
Editor icons follow native theme colors; future Mac and Windows
installer builds derive their icons from the same geometry. Existing published
installers remain unchanged.

The download website is a separately built part of this repository. Its landing
page has the shared app header, **Learn Java**, **Starting from zero.**, and two
direct download buttons: **Download for Mac Silicon** and **Download for Windows
(unsigned)**. The Windows button offers the owner-authorized 0.5.21 installer
preview, labels its unsigned status and links to setup limits. Automatic Windows
updates remain disabled; the signed installer/feed contract is separate.
The secondary **Manual setup (ZIP)** link beside Windows offers the exact kit
embedded in that installer. Home and Downloads keep both primary buttons centered
at the same width regardless of warning length.
It uses the shared light/dark toggle and
centered full-viewport layout. The old `/get-started` address redirects to Downloads.
Browsing, learning and playing require no GitHub sign-in. Current desktop
source uses one public Codepet-owned GitHub App for development and optional
ZeroHub stars. Codepet Zero is registered under `codepetca`, and its public App
IDs are pinned in source. Mac 0.5.43 includes this source; remaining live-provider
acceptance is listed below. Each published download keeps its bundled behavior.
See [the identity plan](ZERO-IDENTITY-PLAN.md) for the rollout and permissions.

Current source opens a native **Zero Start Page** for onboarding and project
selection. Current source contains **Start tutorial** with a **Tutorials** dropdown to the
existing reader, **Project ▾ → New / Clone / Open**, account-scoped recent projects
and guided GitHub setup. Tutorials and opening local work remain available without
sign-in; New and Clone retain their GitHub access checks. Mac0.5.45 ships these controls with an equally wide Start tutorial split control
and Project button, shared Sidebar dropdown styling and compact GitHub account row.
An empty Zero window opens it automatically; existing student editors stay
untouched. **Zero: Start Page** and **⋯ → Start Page** reopen it at any time.
The Explorer sidebar hosts a Zero controls view for native Run/Stop, teaching helpers, contextual
repository/branch/push actions and ZeroHub. Troubleshooting and repository/account
recovery remain in the native overflow. Local Run, Files and opening a local
project remain available without signing in. Current source opens tutorial, new,
cloned, local and recent projects in the current VS Code window, with the editor
owning unsaved-work handling. Mac0.5.43 includes this window-opening behavior.
Mac0.5.43 also keeps an open Zero Start Page tab available when switching
projects, alongside the destination's code and tutorial tabs.

The Start Page guides students through **Sign in to GitHub** →
**Install Zero for GitHub** → **Start tutorial**.
Current local source calls its own `zero-github` provider directly. **Sign in to
GitHub** starts browser authorization and completes the editor session after the
browser return, without entering a code. While signed out, the main tutorial
button says **Sign in to GitHub** and starts only sign-in. It becomes
**Start tutorial** after sign-in, remaining disabled until repository access is
ready. There is no duplicate sign-in button or code-sign-in option. Browser
sign-in failures offer retry guidance; existing device-issued sessions keep
their renewal path. GitHub may still require account
selection, passkey or two-factor authentication. Published downloads retain
their bundled flow. The provider remains registered for the Accounts menu and
other extensions, whose host consent checks still apply.
It stores expiring user/refresh tokens in VS Code SecretStorage; GitHub handles
sign-in and consent, and Zero has no separate password or account.
Signing in runs a read-only check for repository creation and contents writing
and stops at the next Start Page step. If access is missing, **Install Zero for
GitHub** opens the pinned App page after a read-only recheck; **Check again** is
the fallback. The student approves selected repositories on GitHub; Zero never
requests all-repository access, and repositories Zero creates are accessible
automatically. Returning to Zero rechecks and unlocks **Start tutorial** when
ready. Escape or a failed check leaves the current step available to retry.
A saved session receives a read-only check on launch without opening a browser or
starting sign-in. Local Run and Files remain usable while signed out or offline;
cloud repository, push and sharing controls stay hidden until access is ready.
Publication and uploads remain explicit.
`/learn` opens lesson 0 directly in the tutorial reader. All thirteen lessons (0–12)
are listed under three quiet project headings (Greeting app, Study quiz and Coin
game); selecting one updates the reading pane and its bookmarkable
`/tutorials/[lesson]` URL. Narrow screens use a selector with the same groups.
Code blocks in tutorials, docs, source views and ZeroHub copy their exact text when
clicked, with a keyboard-accessible Copy button and success/failure feedback.
Dragging to select text keeps manual copying available.
`/downloads` is the separate platform download page.
The top menu contains Tutorials, Docs and ZeroHub. The Zero logo returns to Home,
where platform download options are available; platform buttons do not appear below tutorials.
Docs opens the complete searchable Zero API directly; method names stay visible
while their details scroll, and category headings scroll normally. Tutorials are
the single learning path: startup, appearance, objects and screen flow are taught
in the relevant lessons. Setup/troubleshooting lives under `/help`, and teacher
notes and the classroom pilot live under `/teachers`. Product, development and
verification records stay in repository documentation. Legacy `/docs/...` guide
bookmarks lead to the corresponding tutorial, help, teacher or repository page.
ZeroHub opens Projects by default, with Projects, Libraries and a separate
Tutorial practice entry. A desktop sidebar contains the ZeroHub title, search
field, Share your work and those three filters, in that order. The gallery sits
in the right pane. On narrow screens the controls stack above the gallery.
The sidebar has no vertical divider. A short tagline under the title says
“Play. Share. Learn.” Below the buttons, a brief description
explains browser projects, reusable libraries and sharing with Zero. Sharing
keeps its purple-tinted fill and stronger border. Account actions stay in the
header; search keeps its magnifying glass, accessible name and “search zerohub”
placeholder.
Drawing Pad is a
maintained Codepet project backed by `codepetca/zero-drawing-pad`, shown alongside
community projects with a tiny description, square screenshot and GitHub source.
It has no Play action until public hosting is verified. Maintained projects do
not claim a community admission record and stay visible if that catalog is down.
Tutorial starters, practice projects and checkpoints are not a separate public
collection. Legacy example routes send readers to Tutorials; their generated
project downloads are retired. Supporting guides link to the lessons instead
of finished-project pages. Lesson/reference source files remain readable.
Students build one feature at a time in their own repository; GitHub/project
workflow is part of the learning outcome. Tutorial setup and the minimal original
project template remain available through their setup instructions. See
[the course project guide](COURSE-PROJECT.md).
The shared website header opens an account dropdown. Signed-out users see a
profile icon; connected users see their GitHub profile image cropped to the
same circle. The purple initial circle stays visible while the image loads
or if it fails. The accessible name retains the full
GitHub username. Images load directly from GitHub’s avatar CDN using the already
verified account ID, without another API lookup, credentials or referrer.
Signed-out users can Sign in to GitHub; connected users see their username and
Sign out without a duplicate sign-in action. Connection failures retain Retry.
The dropdown also switches light/dark mode. The OS preference is the initial
default; a chosen mode persists.
These pages fill the viewport width and at least its height; longer lessons scroll.
Downloads centers its heading and equal-width platform buttons in a vertical stack.
A setup-help link appears below the buttons; current platform/version requirements
appear inside that linked setup guide, keeping Downloads uncluttered;
initial tutorial entries offer the verified empty template and a concise Setup link.
Longer guidance in Docs explains creating and cloning the student-owned repository.
Share your work preserves the shared theme and account dropdown.
Website tutorial steps and reference sections are expanded by default; full guides remain
available. Tutorial step headings use subtle highlights instead of horizontal
dividers. Generic setup/continuation cards are omitted; specific component or
media notes stay muted and unboxed. Previous lesson prose is omitted in favor of the sidebar and Next lesson action. `/hub` is ZeroHub: discover student-hosted games and reusable libraries.
Show only the latest available release of each project. Each project occupies one
square screenshot: the title overlays its top on a dark background and fades at
the edge when too long. A small filled play triangle and open count stay at the bottom-left, with
borderless stars on the same row at the right. The visible metric is icon plus
number; its tooltip and screen-reader text name opens and explain that the
count measures Play-link activations, including repeats.
The single info icon beside the title replaces the old About question mark.
It is green when the site is reachable and yellow otherwise. Tapping
it opens project details: description, green check or yellow warning with the
last check, GitHub author and available version, with the report flag at the
right of that same author row. The native popover
closes with its close button, an outside tap or Escape; keyboard focus stays
visible. Full titles remain available in the details and to assistive technology.
Unconfirmed or unreachable
previews are muted until the existing page-reachability check succeeds; this does
not verify gameplay. The screenshot opens the hosted game in a new tab. Older
playable releases without screenshots use a Play tile. Withdrawn images remain static.
Library cards retain their text layout and usage disclosure.
The version opens the GitHub repository;
unversioned maintained projects link through the author instead. There is no
separate GitHub action. Game cards omit controls,
source downloads and release internals; a single top note explains author hosting.
Existing exact-version links remain valid, including withdrawn-release status.
Library usage stays inside a disclosure. New game submissions require a committed
square PNG screenshot; existing accepted releases remain available. Maintainers
can supplement legacy cards with real gameplay screenshots matched to the exact
project/source commit. Accepted uploaded previews take precedence. A screenshot
does not change a release's availability or create a new accepted artifact.
`/hub/share` explains native Zero Share commands and official GitHub forms.
Tutorials show the current project name (Greeting App, Study Quiz or Coin Game)
as the main heading and the lesson title below it. Docs and ZeroHub retain their
section heading and muted topic subtitle.
Purple eyebrow labels and back controls are removed; top navigation, reader
sidebars and Next lesson remain available. Hub browsing/downloads remain public.
An optional GitHub connection lets users star and unstar repositories directly
on ZeroHub, with one star per GitHub account per repository. The browser uses the
same App with a separate credential family and an eight-hour reconnect policy.
Its ordinary user token can carry the App/user intersection of installed
repository permissions; the current star routes do not make that token star-only.
Desktop and browser sessions do not pair or transfer credentials automatically.
Short-lived browser sessions require reconnection after expiry. Public counts may lag; no separate vote store
is created. Site checks show cached page reachability, not verified gameplay.
Report a problem opens a prefilled GitHub issue for the user to review and submit.
Project details show a green circled check for reachable sites and a yellow
warning for unavailable or unknown checks, followed by a local check time such
as **Oct 20 · 12:56 PM** when known. Reporting uses a flag icon inside the details.
Stars show a borderless star icon and count, filled when starred. Accessible
labels describe each control and status; unavailable star counts use an em dash.
See [ZeroHub feedback](ZEROHUB-FEEDBACK.md) for setup and limits.
ZeroHub displays aggregate Play-link activations as opens and library adoption
from declared dependencies in shared game snapshots. Opens include
repeat activations; adoption counts repositories, with incomplete older coverage
explicitly labelled. Neither measures unique people or runtime usefulness.
See [metrics and activation](ZEROHUB-METRICS.md).
Contribution instructions require GitHub sign-in in Zero and the same personal
account for the browser publication form. The replacement has no reservation or
folder-upload service. Existing kit/installer downloads have separate release records.
See [repository boundaries](ARCHITECTURE.md) and [website plan](WEBSITE-PLAN.md).

## App and learning contract

The following describes the current local API and lessons. Existing published
kits keep their original source and build files until explicitly upgraded.

`zero.App` is event-driven: `settings()` sets `title(...)` and initial
`size(...)` and optional `padding(...)` around the content; `setup()` creates
Zero controls and calls `show(...)`. The tutorial uses Zero buttons, labels,
text fields and layouts without direct JavaFX imports.
The installed kit's default app shows Hello, world!; the learning projects start
with empty runnable boilerplate. Lessons 0–2 grow one Greeting app from label to
button to name input. Lessons 3–7 grow one Study quiz: answer feedback, attempts,
reset methods, a Counter object, then Question objects/arrays and scoring. Lessons
8–12 grow one Coin game with student-authored Player/Coin, win/restart, ScoreDisplay
reuse, and optional media/scrolling. Lesson 10 extracts PlayerInput from a busy
game Main, then reopens Study and Game to extract and reuse ScoreDisplay. Lesson
11 practises compatible changes, optionally adds WASD controls, then extracts
a harmless CreditsBadge for explicitly labelled Tutorial practice sharing. Copies
are expected and excluded from ordinary catalogue search. An original community
or core contribution remains an optional extension with attribution, licensing
and checks.
Lesson 12 adds optional artwork, sound and a small scrolling extension to the
same Coin game. Larger game references are maintainer completeness checks,
not additional tutorial requirements; see [basic games](BASIC-GAMES.md).
The scored quiz remains a later reuse example.
The new local tutorial pass inserts one-coin native controls before arrays/win,
then reuses unchanged ScoreDisplay in the study app and coin game.
[Lesson 10](../student-template/lessons/10-components.md#screens-and-app-flow) explains controls/components and screen flow in games;
[the teaching plan](TUTORIAL-PLAN.md) distinguishes current conventions from proposed
welcome/result/countdown helpers. Existing published kits keep their original bytes.
Tutorial pages use the current project name as their main heading: Greeting App,
Study Quiz or Coin Game. The large lesson title appears directly below that
heading, followed by the target illustration and full numbered editing/running
instructions with copyable code. There is no short three-step Summary, Done
checkpoint, or Code and explanation heading/disclosure. Main instructions stay
visible; completed comparison references remain optional disclosures in the editor.
Each lesson ends with a short encouraging message. Optional
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
Browser games shrink to fit smaller screens while keeping their Java canvas
coordinates and aspect ratio. A canvas touch maps to the primary mouse input;
students still choose readable text, touch targets and any keyboard alternatives.
Ordinary App forms and native JavaFX window sizing keep their existing behavior.

`Sound` and `Music` helpers are available to both App and
GameApp. Load once with `loadSound` or `loadMusic`; short clips share a per-app
canonical-resource cache, while each music object has an independent buffered
player. Ordinary Java event handlers decide when to play/pause/stop/mute. App
shutdown, startup/frame failure and window closing release owned audio, including
when custom shutdown fails. Sky Hop and the separate audio playground demonstrate
reuse. Published core0.1.2 and released kit bytes remain unchanged.


Game helpers add `SpriteAnimation`, shared-pixel `ImageRegion`
views, one-frame press input, window focus, centered/rotated and vertically flipped
image drawing, centered text and `Collisions` geometry predicates. Animations
advance only through explicit `update(seconds)` calls. Images are cached per app;
independent animations share pixels. Physics, game states, scoring and obstacle
rules stay in ordinary student classes. Sky Hop and the optional sprite playground
exercise this contract; see [game systems](GAME-SYSTEMS.md). Published core0.1.2
and kit bytes are unchanged.

The local source also adds optional `Actor` objects. Students can write
`Player extends Actor` or `Enemy extends Actor`, inheriting a centre position,
size, clockwise rotation, sprite drawing and explicit `move`, `moveForward`,
`rotate`, `face` and `moveToward` helpers. Main calls each actor's update and draw;
subclasses add their own game rules. Actors do not register themselves or supply
physics or collision responses. This source addition is not an installer release.


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
commit identity. Repositories created through Zero are public, including their
source and included files; students should keep secrets and private material out.
Existing or GitHub-created repositories may retain their visibility, with teacher
collaborator access where needed. Public game publishing remains optional. On the Zero Start Page, **Start tutorial**
is primary; **New project** skips the tutorial and creates original work. The **…** menu also opens **Tutorials** for existing projects. The action
selects the matching verified tutorial scaffold. The flow collects a repository
name and parent folder before creating a public copy in
the connected personal account, verifying App access, cloning and opening it.
The location picker starts at `~/Zero Projects` and can choose another parent.
**New project…** uses the original-project template through the same flow.
Existing repositories use **Clone from GitHub…** with explicit selected-repository
access. Zero owns these guarded clone commands and their transient credentials.
If creation or cloning is interrupted, preserve the repository and partial folder
and offer explicit recovery instead of blindly creating another repository.
Students own the created repository and clone; there is no local-folder or
project-ZIP tutorial alternative. **Open local project** and Setup help remain
available from the empty sidebar. Reopen **Tutorials** to continue reading; lesson,
scroll position and disclosure state persist locally per project. This is reading
state only, not completion or grading. Choose the first lesson through **All
tutorials** to restart the reading sequence without changing student code.
**Start tutorial** creates a new repository and is not a reset for the existing one. Completed teacher
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
Publish use the ordinary live GitHub flow. Ordinary ZeroHub contributions still require
separate original work. Lesson11 allows only the reserved CreditsBadge library
from the Coin tutorial into separate Tutorial practice discovery. Legacy local-only
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
with generated catalog snapshots. Optional website star sessions are separate from publication and cannot change the registry. Accepted versions
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

Run App saves and builds ordinary Java through the project’s Maven wrapper, then
opens the app in its own native JavaFX desktop window. Local Run does not run the
browser compatibility checker or WebFX compiler. Publish app and the advanced
Export for web action perform the browser checks and production WebFX compilation
locally; native success does not establish browser compatibility. Publish app
deploys the validated browser build through GitHub; ZeroHub links to the
student-hosted app. Cloud development and hosted compilation are out of scope.
See [browser builds](WEB-EXPORT.md) for the strict resolved-API gate and limits.
Local checks and a released installer do not replace the remaining student/provider acceptance.

Browser sharing adds **Publish app** in the repository dropdown and **Export for
web** in the title menu. Students keep ordinary Java. A reviewed GitHub Pages
setup leads to an exact-version verified playable link. Recognized unchanged
older publishing kits get an explicit **Update publishing files** review, followed
by ordinary Commit & push and exact-version verification. Student edits and
unknown setups are preserved; the old files remain in project history. Live is
the student default; simulation is an explicit testing setting. Share game can attach the
exact verified publication automatically;
ZeroHub offers Play latest on student hosting alongside exact source downloads.
See [browser export](WEB-EXPORT.md) for the tested profile and limits.

- Preserve the current panel height, with the shared Zero mark in the existing
  activity-bar/view icon. VS Code owns the native title; no content heading is added.
- The native Explorer handles all file browsing, selection, editor tracking and file operations.
  A Zero view in the same Explorer container holds Run/Stop, repository actions and teaching helpers,
  without extra GitHub/ZeroHub headings. VS Code owns the view order: drag Zero above the file tree
  once if needed; the editor remembers it. No private layout commands or state edits are used.
  Idle status is empty; app progress/errors
  appear when there is a message. Signed-out GitHub controls lead to the Start Page browser sign-in;
  the project dropdown and branch are hidden, and local Run/files remain usable.
  Signed in shows the project menu as the current folder or connected owner/repository,
  without a duplicate username, with a right chevron indicating its menu.
  Its label wraps to two lines;
  the full name stays accessible and in its tooltip. GitHub account… in that menu
  opens the existing account actions. Text-only ZeroHub opens Projects, Libraries and Share
  project for eligible signed-in original projects. Clone from GitHub starts its location picker at
  `~/Zero Projects`, with another location selectable. Open local project opens
  an existing Zero folder without cloning/moving it. New project collects its
  name and location before creating and cloning a public repository. An eligible
  unconnected original local project can Create a repository to create and
  connect an empty remote, or Connect to GitHub using an existing repository.
  Connected projects keep publishing and branch
  actions in the menu, and a visible current branch. Commit & push
  and Merge to main remain direct actions. Simulation
  remains visibly labeled. ZeroHub offers Browse (Projects on
  the website, or native library browsing) and signed-in Share project for original
  work. Tutorial repositories use GitHub normally; copied tutorial work is not an original
  community contribution. The reserved CreditsBadge has a separate practice-sharing
  path from the Coin repository. Tutorials and Setup help live in the native view
  overflow; Copy repository link lives in the repository menu. **New ▾** opens a dropdown in the Zero controls with **New class…**, **New file…**,
  **New folder…**, **New asset…** and **Copy asset paths** after import. New class
  creates an ordinary public class beside Main; files/folders choose Java source,
  Resources or Project files using native prompts. Routine text inputs show one short
  label with no explanatory or confirm/cancel footer; validation errors appear as needed. Relative names can create
  subfolders. Existing entries are preserved, cancellation makes no changes, and
  the native Explorer notices created files and new files open in the normal editor.
  **Review or restore changes…** in the project menu opens the existing native
  review, discard and file-history choices. There is no separate tools row. Supported VS Code
  user controls can still move/hide views. There is no team/PR mode.
- The primary button says Run when idle, Stop while queued/building/running,
  and disabled Stopping… while owned work settles. Failures or closing the native
  app window return it to Run. Explicit palette commands keep separate run/restart
  and stop behavior. Run saves files and runs the project’s Maven wrapper to build
  and open an ordinary JavaFX window. Re-running stops the previous process
  before rebuilding; Stop cancels the owned build or running process. There is
  no hot reload or browser compilation on local Run. The existing native command
  ID remains a compatibility alias. Browser preview remains available explicitly
  through Export for web; local Run has no Open in browser action.
- A tutorial repository opens its bundled Tutorials editor tab beside Main.java
  once when the editor is empty. Tutorials in the view menu or Command Palette
  reopens it; ordinary older-kit Markdown guides remain supported. All13 lessons,
  illustrations, code and linked Java references are bundled for offline reading.
  Its numbered instructions and code stay visible; only completed code references
  use optional disclosures.
  The tab retains the selected lesson, scroll and disclosures per project. It
  supports native floating windows and moves back into editor groups. Open in
  browser opens the current canonical lesson on the website; website navigation
  does not synchronize back into the editor. Start tutorial stays in the ready empty sidebar and
  overflow; Clone from GitHub is in the project menu. Neither lesson navigation nor opening
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
  may require a student-chosen editor reload in earlier downloads. Mac0.5.43
  lets **Install and Relaunch** reopen Zero and verify the updated extension.
  Its isolated Zero editor windows reload when idle through VS Code's native
  Reload Window command, retaining normal unsaved-buffer safeguards. Running apps
  and Zero operations defer reload; ordinary Code profiles are untouched.
  Upgrading from0.5.33 or earlier still needs one manual Zero reopen/editor reload
  because those installed updaters contain the previous handoff.
  Signed/notarized Mac0.5.43 is published; Windows0.5.21 is a published unsigned
  preview with automatic updates disabled. Native setup uses a `Zero` folder
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
- An optional settings-only profile follows the system light/dark appearance with 500 ms autosave;
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

Current local desktop source uses Zero's `zero-github` provider with browser
authorization for new connections, with no device-code option. Browser-issued
tokens renew through the first-party server; existing device sessions retain
secretless GitHub renewal. Both use the same guarded SecretStorage lifecycle.
Native ⋯ → GitHub Account… offers Change GitHub account and Sign out.
Sign out clears only Zero's local connection; it preserves
projects, Git history and other extensions' accounts. Account, token or session
changes invalidate pending remote work. There is no password/token entry form.
Native ⋯ → Repository Actions → Create a repository collects a name, explains that subsequent
pushes make source and included files public, creates an empty public repository
under that personal account, verifies access and connects the open original local
project. It does not push source. New project
and Start tutorial create from the appropriate verified template and clone into
the chosen location. There is no GitHub Classroom flow.

Connect accepts ordinary GitHub HTTPS repository URLs. It initializes/adds
origin only in the exact standalone student Git root, with confirmation before
replacing origin. It rejects nested projects. Connection is local: it does not
verify remote ownership, existence or access and does not upload.

`zero.uploadMode` defaults to `live`. Nothing uploads or publishes on activation,
sign-in or connection alone. Explicit Publish saves open files, commits changes
through the existing message input when needed, pushes unuploaded commits, then
deploys that exact version. Already committed work needs no new message; a clean
uploaded main skips uploading. Cancellation or upload failure stops deployment.
On a change branch, Publish asks the student to finish with Merge to main first;
it never switches or merges branches. After verified deployment, Open app and
Copy playable link appear in the sidebar and Zero Output includes the actual URL.
First/new-destination Publish shows a short warning
that the app and included assets will be public;
later explicit Publish actions revalidate and update that approved site without
another destination dialog. Publishing setup continues through its upload without
a second publish confirmation. The App requests Contents, Workflows, Actions and
Pages capabilities on permitted repositories. First-time Publish creates a missing
Pages site with GitHub Actions as its build source, using the separately approved
Administration write grant. Existing sites, domains and repository visibility are
not changed. An installation that has not approved the grant gets one GitHub
permission-approval action instead of manual Pages settings. Before committing,
Publish upgrades only allowlisted, untouched older Zero helpers to the bundled
browser-supported source; custom helpers are preserved and require review. Build
locks left by a stopped, identifiable build are recovered automatically; active
or uncertain owners remain protected. Commit & push shows **Preparing commit…** on its
button while checking the project and GitHub access, then **Committing & pushing…**
after confirmation. Progress clears on completion, cancellation or failure.
It saves files and opens an empty input labeled **Commit message**, with the small
`<Enter> to confirm · <Esc> to cancel` helper used by Zero's text-entry popups.
Repository and branch remain in the sidebar;
submitting the message proceeds directly.
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

Live transport uses transient credentials from the captured Zero GitHub App session.
It requires Git 2.31+ for runtime credential configuration and rejects older Git
before credential dispatch.
The session is revalidated before network actions, so account/session changes
require another review. Expiring tokens are stored in VS Code SecretStorage.
Git transport injects them only into guarded credential-bearing children
temporarily; they do not appear in Git configuration files, command arguments,
URLs or logs. No client secret or App
private key ships in the extension. It has no custom password/token UI. Automated checks mock
sessions and intercept transport; they do not prove a real upload.
The same guarded transport permits only exact-destination pushes, branch-head
queries and SHA-pinned fetches needed to update main. Local Git receives no native
credentials. Zero's separate clone service also authenticates only its exact
verified destination. General Source Control and terminal network commands do
not automatically inherit Zero's credentials; their normal Git configuration and
authentication remain separate. Preparation queries remote main without changing local files/refs;
the reviewed executor performs updates, with drift/session checks throughout.

Copy Repository Link returns a page URL for separate Pika submission. A copied
link does not establish that code was uploaded or that the remote is current.
After Finish, verify completed files on main after a real upload, then submit the
link separately in Pika. A branch upload alone does not finish a change on main.

## Integration contract

`zero.json` marks a student project in the workspace root, or its
`student-template/` child for kit development. The project includes `mvnw`,
`mvnw.cmd`, `pom.xml` and `.vscode/tasks.json`. Normal Run, setup Run test and
the configured Zero run task use the project wrapper with `clean compile javafx:run`
to build and launch native JavaFX in that project;
cleaning avoids stale classes from the Java language server. Arguments are
passed separately from untrusted text.

The default build task has type `zero`, task `run` and matcher `$zero-java`.
The extension TaskProvider owns sidebar and shortcut runs. A separate wrapper
task supports running without Zero. Java language diagnostics require
`redhat.java`; `vscjava.vscode-java-debug` supplies Java debugging support.
The starter targets Java 17, uses pinned JavaFX 21.0.12 and needs a supported
JDK 17+ for builds. JDK 17 was tested; editor runtime requirements may differ.

## Verification and distribution limits

See [VERIFICATION.md](VERIFICATION.md) for actual local checks and their scope.
The earlier native-provider trial and later development-host App/device-flow
sign-in, selected private clone and guarded push are recorded separately in
[the identity plan](ZERO-IDENTITY-PLAN.md). Empty-account onboarding, App-created
repositories, renewal/revocation, account switching, Pages setup/repeat publishing
and browser identity still need observed acceptance. Registration, mocks and a
released installer do not establish those live results. The current MVP targets
Mac with Apple Silicon and Windows; Linux and Intel Macs are unsupported.
Windows offers an unsigned 0.5.21 native preview and its matching manual ZIP;
automatic updates remain disabled. Signed production Windows releases still need
signing, physical acceptance and authorization; see
[the Windows contract](WINDOWS-INSTALLER.md).
Physical Windows, school
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

## Tutorial-first installation — 2026-10-19

Mac 0.5.43 opens the Zero Start Page in an empty editor window with the sequence
Sign in to GitHub → Install Zero for GitHub → Start tutorial. A saved session is
checked read-only on launch. The clone opens Main beside Tutorials. Existing
student sessions resume normally. The completed bundled Hello World project is
only an explicit Setup help → Test installation action, opens in a separate
window labelled Installation test, and never automatically opens tutorial lesson 0.

## Searchable project picker

Current source changes **Clone from GitHub** to a native searchable picker.
**Recent projects** on this Mac appear first, ordered by last open, followed by
**Your Zero repositories** ordered by latest push. **Paste a GitHub URL…** remains
available while loading, after failure, and while filtering. Choosing a recent
entry validates and opens the existing Zero folder without cloning it again.

History records successful Zero clones, local opens and the currently opened
project, capped at20 per numeric GitHub account. It starts with this feature; it
does not infer earlier work from filesystem timestamps. Missing or unmarked
folders and the bundled setup starter are omitted. Other accounts' history is
not offered. History storage failures do not prevent opening projects.

GitHub discovery reads only repositories accessible through the same account's
Codepet App installation and recognizes bounded root/legacy zero.json markers.
Results load progressively; selection, Escape, disposal or account drift cancels
pending requests. A20-second discovery budget and bounded pagination keep the
picker usable; truncated or unavailable results retain the URL fallback. Existing
clone/account/destination guards remain. Mac0.5.43 ships this picker; earlier downloads retain their bundled clone flow.
