# Zero shared design

Start here before future UI work. This file records the shared visual direction
and its approval status. [UI and UX guidelines](docs/UI-UX-GUIDELINES.md) remains
the canonical interaction, accessibility and verification standard; follow it
rather than copying its rules into individual components. Product behavior stays
in [Product](docs/PRODUCT.md), and commands in [Development](docs/DEVELOPMENT.md).

## Current interaction rules

Owner refinement,2026-10-26: in the Student Explorer preview, remove the ZeroHub
and New controls from the controls panel. Creation belongs in the native Project
header's New menu and tree context menus; ZeroHub belongs in the Project overflow.
Keep the existing guards and supported host controls. Default replacement still
awaits the overall visual decision.

Owner decisions consolidated through 2026-10-21. These are the current rules and
supersede conflicting wording in the older dated notes below. Preserve them
when adding features; a new feature does not reset the agreed interaction style.

- Use one primary **Run**/**Stop** button. It offers Stop while queued, checking,
  compiling or running; show disabled **Stopping…** until owned work settles.
  A connected, ready project adds an adjacent **Run options** arrow with
  **Publish app**. The main click still runs locally; disable the publishing
  dropdown while running or stopping. Mac 0.5.34 includes this split control.
  Failures and closing the native JavaFX window return to Run. Preserve explicit
  Run App/Stop App palette commands and existing cancellation/generation guards.
  Run saves and builds through the project Maven wrapper, opening a desktop
  JavaFX window; Stop cancels the build or app process. Local Run has no browser
  compilation or Open in browser action. Publish app and advanced Export for web
  retain browser compatibility checks and production compilation; explicit export
  preview remains available. Mac 0.5.34 ships native Run; earlier
  downloads retain their bundled Run behavior.
- Keep a native **Zero** status-bar action in Zero windows so students can
  return from Source Control or other panels to Explorer and the Zero controls.
  It is navigation only, available independently of sign-in or busy work.
- Keep the current panel height; show the Zero mark only in its existing native
  activity-bar/view icon. Do not add an in-panel heading or alter host CSS/DOM.
- Use one short title above routine text inputs, such as **Class name** or
  **Commit Message**. Omit explanatory copy; put the small
  `<Enter> to confirm · <Esc> to cancel` keyboard helper below the input and show
  validation errors when needed. Keep
  consequential destinations and public/destructive changes concise and explicit.
- Use native Explorer for files, with Zero controls and teaching helpers in the same sidebar. Use supported
  VS Code APIs, native themes, accessible keyboard behavior and the existing
  visual system. Avoid extra headings, duplicate controls and explanatory clutter.
- Reuse the sidebar's native dropdown appearance across editor screens. Shared
  controls live in `extension/media/controls.css`; extend the existing component
  instead of copying its styles. Record repeated patterns in
  [editor components](design/EDITOR-COMPONENTS.md) and compare actual renderer
  states in the local `/components` prototype before introducing a new variant.
- The **Zero Start Page** owns onboarding: **Start tutorial** with a **Tutorials** dropdown,
  **Project ▾ → New / Clone / Open**, recent projects and guided GitHub sign-in/access.
  The Start tutorial split control and Project button share the same width.
  While signed out, its main action says **Sign in to GitHub** and opens browser
  sign-in only. After sign-in it says **Start tutorial**, enabled only when
  repository access is ready. Omit the duplicate sign-in action and code-sign-in
  option. Keep Tutorials available without sign-in. Show it automatically in an empty Zero window; preserve existing editors and
  restore its native editor tab. Reopen it through **Zero: Start Page** or the
  sidebar's **⋯ → Start Page**. Keep local opening available without GitHub.
- On the Start Page, ready GitHub access is one line: **GitHub · username**.
  Signed out shows **Sign in to GitHub**. Keep checking, setup and error guidance
  visible when action is needed; omit the routine Ready to start line.
- The sidebar is for project development: Run/Stop, native Explorer, contextual repository
  and branch actions, Commit & push, Merge to main and ZeroHub. Empty windows
  offer only Open Start Page. A local project needing cloud setup offers GitHub
  setup navigation to the Start Page; local Run/Files remain available offline.
  A ready project shows owner/repository without a duplicate username row. Its
  contextual menu retains repository/account/recovery actions and omits global
  New/Clone/Open project choices. Keep labels wrapped and fully accessible.
  ZeroHub offers Projects, Libraries and eligible Share project; tutorial/local
  practice sharing remains blocked. Troubleshooting stays in native ⋯.
- Clicking **New ▾** opens **New class…**, **New file…**, **New folder…**,
  **New asset…** and **Copy asset paths** after import in a dropdown beneath New.
  Use native name/location prompts; keep new classes
  ordinary Java beside Main and open new files in the editor. **Review or restore changes…** belongs in the project menu; it
  opens the existing native review/discard/restore choices. No separate tools row.
- Clone defaults to **~/Zero Projects**, with a native location picker to choose
  another parent. Clone opens a searchable native picker: recent projects on this
  Mac first, then the signed-in account's accessible Zero repositories, with
  **Paste a GitHub URL…** always available. A recent entry reopens its local folder;
  it never clones another copy. Repository discovery loads in the background and
  preserves local choices when offline or cancelled. Remember at most 20 projects
  per numeric GitHub account, excluding the bundled setup project.
  Zero's explicit clone commands use its guarded GitHub App
  transport and a fresh destination. General Source Control and terminal network
  commands do not automatically share Zero's authentication.
  Clone, New project, Start tutorial, Open local project and recent projects
  reuse the current VS Code window with native unsaved-work handling. Keep an
  open Zero Start Page available as a tab alongside the destination project.
  Sign-out
  preserves local folders, Git history and the open project.
- Use clear Git labels: **New branch**, **Update from main**, **Commit & push**, **Merge to main**.
  New branch is local and remains available while signed out. Update from main
  brings GitHub main into the current branch without uploading. Update branch
  from GitHub separately gets the same remote feature. Keep routine actions direct
  with native progress. Explicit checkpoint and conflict choices are the required
  exception: preserve work, state the local commit, and allow cancellation.
  Use the **Commit Message** title and an empty field, with the same small keyboard helper below the input.
  Keep repository and branch in the sidebar. Show an inline
  spinner and **Preparing commit…** on the button during preparation, then
  **Committing & pushing…** after confirmation; clear on completion/cancel/error.
  Entering a branch name or commit message proceeds directly; clicking Merge to
  main starts its guarded operation. Do not add routine confirmation dialogs.
- After a verified successful merge and push, automatically delete only the
  unchanged finished **local** branch through the existing safety checks. Keep
  the remote branch. Failed, paused or conflicted operations skip cleanup;
  refused cleanup preserves the work and reports the condition briefly.
- First publication, or a changed publishing destination, gets one short warning:
  **“Your app and included assets will be public.”** Show the destination.
  Do not ask again after setup/upload or for routine updates to the same site.
  Keep native authorization, account, destination, source and conflict checks.
- Show routine success in the sidebar, without success popups. Use brief results
  such as **“Pushed to main”**, **“Merged to main”**, **“App published”**,
  **“Export ready”**, **“ZIP saved”** and **“App running”**. Keep relevant branch
  or library names. Put commit hashes, sizes and longer guidance in Zero Output.
- Keep warnings, errors and required decisions visible. When attention is needed,
  include the next step: for example, **“Branch updated. Run App, then Merge to
  main.”** or **“Merged to main · local branch kept; see Output”**. A concise
  message must still describe the actual outcome accurately.
- Preserve useful follow-up actions in the sidebar: **Open app / Copy playable
  link** for the saved verified publication and **Preview export / Save ZIP /
  Share export** for the current project's completed export. Reuse their guarded
  commands; removing a popup must not remove access to an action.

These are student-product interaction decisions. They do not authorize agent
pushes, merges to the integration branch, public publication, releases or account
changes. Ordinary Java, explicit object updates, student-owned repositories and
separate Pika submission remain the product baseline.

## Shared GitHub identity — owner decision, 2026-10-18

The local, unreleased source uses one public Codepet-owned GitHub App for native
development and optional ZeroHub stars. Codepet Zero is registered under
`codepetca`, and the public App IDs are pinned in source. Live acceptance,
production activation and an authorized native release remain pending. Published
kits keep their original behavior. This section supersedes the older VS Code
GitHub-provider and browser-only repository-creation decisions below; those dated
entries remain historical design records. See [the identity plan](docs/ZERO-IDENTITY-PLAN.md).

Use GitHub browser sign-in through Zero's supported `zero-github` provider and
native editor controls. Store expiring credentials in VS Code SecretStorage;
no password or token-entry form. Show username as the account label and bind
remote actions to its numeric GitHub ID. Sign out disconnects only Zero on this
computer, preserves local work and leaves other extensions' accounts alone.
Keep local Run/files available offline after initial build setup.

Recommend selected repositories when installing the App. Repositories the App
creates gain access automatically; never silently select all repositories.
Start tutorial chooses its verified scaffold, then collects repository name and
location before creating a public repository, verifying, cloning and opening.
New project uses the original starter through the same flow. Create a repository
for an existing original local project collects a name, explains that subsequent
pushes make source and included files public, creates an empty public remote and
connects without pushing. Existing/cloned repository visibility stays unchanged.
Preserve recovery links and partial folders
after uncertain creation or clone failure; do not silently retry creation.

The same App serves optional browser sign-in, with separate browser/editor
credential families and no automatic pairing or token transfer. An ordinary
browser user token can carry the installed repository permissions as well as
starring. Do not describe it as star-only or imply that desktop sign-in creates
a browser session. Browsing/learning/playing stay public; the browser currently
requires reconnection after eight hours.

Publish automatically sets up a missing Pages site after GitHub approves the
reviewed Administration write grant. Preserve existing sites, custom domains,
existing/cloned repository visibility and the single public-destination warning.
Untouched allowlisted older helpers update before the normal commit review;
confirmed stopped browser builds recover their stale locks automatically.

## Tutorial tab and browser actions — accepted 2026-10-16

Owner selected the second tutorial concept: ordinary Java on the left and a
native Tutorials editor tab beside it. Preserve the canonical lesson wording,
target illustration, short numbered tasks and optional full explanation/code.
Open in browser opens the current hosted lesson. The native-default Run decision
in Current interaction rules supersedes this concept’s managed Zero App tab and
its local Open in browser action. Explicit browser export preview remains
available through Export for web.
The panel supports native detach/reattach and restoration of reading position.
Actual Mac/Chrome acceptance and combined visual comparison are recorded in
[design QA](design-qa.md). Git-tab exploration remains parked. The newer account
and repository-menu rules above supersede the sidebar shown in the concept.

## Approved and proposed

### Remembered website preferences — 2026-10-16

These are the owner's continuing design defaults. Preserve them in future website
work unless the owner requests a change. Prefer a subtle appearance and keep the
current task's content visually prominent.

| Surface | Default |
| --- | --- |
| Tutorials | No Previous links or horizontal dividers, including section/footer rules. |
| Tutorial heading | Show the current project name in title case: Greeting App, Study Quiz or Coin Game. |
| Tutorial summary | Show the large lesson title below the project heading. Use “Summary” inside the clearly visible purple-tinted card (stronger in dark mode) containing actions, Done and image; columns on desktop, stacked on phones. Omit short description labels. |
| Lesson ending | Close the final code/explanation section with a short encouraging message in plain text. |
| Tutorial steps | Highlight numbered step titles with subtle theme backgrounds. |
| Secondary guidance | No generic setup or continuation cards; keep lesson-specific notes muted and unboxed. |
| API reference | Category titles scroll away; each method name sticks through its own details. |
| Learning and documentation | Tutorials are the single learning path; Docs is the API reference. Explain startup, appearance, objects and screen flow in the relevant lessons. Keep setup help and teacher material separate, and maintainer records in the repository. |
| Scrollbars | Transparent tracks matching the surrounding background, with thin muted thumbs. |
| Website title | Use the approved icon followed by outlined lowercase zero as one SVG image. Dark mode uses the light-purple accent icon without a background and white lettering. |
| ZeroHub Projects | One square with title over a contrasting image header and long-text fade; muted unconfirmed previews; stars/flag/author at the bottom. Reveal description on hover/focus with a title toggle for touch. Preserve readable content when text is enlarged. |
| Themes | Apply the same choices in light and dark; the root page follows the selected theme too. |

Keep the sidebar, Next lesson action, search, code copying, deep links, accessible
focus and ordinary scrolling usable. See the dated corrections below for details.

| Surface | Status |
| --- | --- |
| Home page with app header, Learn Java and Mac/Windows downloads | Owner-approved download-first flow 2026-10-15; GitHub welcome belongs in desktop Zero. |
| Shared Learn/downloads design in light and dark | Owner-approved 2026-10-13; applies to the tutorial reader and Downloads. |
| Minimal editor sidebar in light and dark | Owner-approved 2026-10-13: one Run/Stop, GitHub and ZeroHub view; idle status hidden; Sign in/username; New branch; Tutorials/Setup overflow. Native VS Code adaptation remains required. |
| Docs reader | Owner-approved 2026-10-14 API mock: method/category sidebar, search and concise entries; preserve current shared navigation, themes and code copying. Setup and longer guides stay linked. |
| ZeroHub examples | Owner-requested 2026-10-13; minimal original-project starter, four practice projects and three optional advanced projects; maintained complete downloads, real previews and source links; no Examples top-menu entry. |
| Community Hub | Existing library/project contracts and publication behavior retained. |

Review the runnable [design playground](design/playground/README.md) before
accepting a proposal. The playground is an isolated visual review surface;
its controls and status examples do not establish editor, download or upload
behavior. Owner approval authorizes applying this design to Learn/downloads and the sidebar.
It does not authorize release changes, publishing, pushes, deployments or credentials. Keep release 0.5.8 frozen;
signing and physical Windows verification remain deferred.

## Shared baseline

Reusable explicit-color SVGs and PNG export instructions are in
[Zero icon assets](design/brand/README.md). Owner-selected2026-10-18: softened
slash corners and20%thicker circle/slash (2.4-unit stroke,0.6-unit slash corner
radius on the24-unit canvas). Use the purple transparent mark on light web
surfaces. The2026-10-20title correction uses a transparent light-purple icon on
dark web surfaces; browser/share icons keep the white-on-purple inverse.
Derive theme-aware editor and native raster geometry from these shared assets;
keep action icons distinct from branding.

Use the existing Zero brand assets. Preserve the restrained white/purple
identity and `#683bef` accent. [Shared tokens](design/tokens.json) describe the
approved palette, typography, spacing and control treatment; adapters translate
those roles to each surface. The approved dark companion applies to Home, Learn and Downloads; host theme roles govern the sidebar. Avoid extra decorative colors, gradients, shadows and illustrations.

- **Typography:** native system sans-serif for web prose, with a compact readable
  hierarchy. Code retains a monospace face. Use the editor's selected font and
  size in VS Code rather than forcing web typography into its shell.
- **Spacing:** use the shared spacing scale for related controls and generous
  separation between decisions. The landing keeps its centered, sparse group;
  Learn can use a bounded reading width; editor content follows sidebar density.
- **Surfaces and corners:** light web surfaces stay white with subtle neutral
  boundaries. Dark Learn surfaces use the paired semantic tokens. Keep corners
  modest (about 6px on web actions); avoid turning every paragraph into a card.
- **Icons:** small, familiar icons support action labels, never replace essential
  wording. Use Lucide icons for website actions and controls, retaining the Zero
  mark and supported native editor icon conventions.
- **Focus:** visible focus is distinct from hover and selection. Web focus uses the
  reviewed focus token; editor focus follows host theme and high-contrast colors.
- **Actions and errors:** maintain one dominant action per decision, restrained
  secondary actions and plain state text. Error examples pair the condition with
  an actionable recovery; color alone does not convey Ready or Error.

## Surface adaptations and review scope

Home uses the shared app header above **Learn Java**, **Starting from zero.**
and two direct buttons: **Download for Mac Silicon** and **Download for Windows (ZIP)**. GitHub connection is handled
by the downloaded app's native welcome, using Zero's GitHub App connection and
GitHub's device-code/consent flow after activation.
It uses the centered full-viewport layout and shared appearance toggle. Tutorials opens
lesson 0 directly with the complete lesson sidebar and a reading pane. The owner
removed the overview landing on 2026-10-13. The separate Download page offers
**Download for Mac Silicon** above the Windows complete-kit ZIP/manual-setup action.
Center the heading and stacked buttons within the available page area. Do not
invent availability, offer an unpublished Windows EXE, add Linux support, or add
long instructions to the download controls. Release metadata remains
the authority for actual downloads.

The editor adapts shared hierarchy and roles through VS Code theme variables and
supported extension APIs. Honor user-selected light, dark and high-contrast
themes, fonts, keyboard behavior and focus; do not override the editor shell or
force the web palette onto host controls. Playground sidebar examples are only
Ready/Error review fixtures and do not prove a live extension host.

Keep the option-2 sidebar minimal. Local Run remains independent of GitHub;
ordinary Java, explicit object updates, student-owned repositories and separate
Pika submission remain unchanged. No Hub redesign or behavior/contract change is
part of this review.

Future UI proposals should name their affected surface and approval status,
reuse these token roles, link the canonical guidelines and show the relevant
states in the playground or real host. Record actual keyboard, responsive,
theme and operating-system coverage before implementation acceptance. Screenshots
and browser fixtures do not substitute for native/editor verification.

## Download page — owner correction, 2026-10-13

Platform downloads live on `/downloads`, separate from Tutorials (`/learn`).
Download is a regular navigation item with the same spacing and current-page
indicator as the other pages, without a divider or special emphasis. Both pages
retain the approved shared light/dark themes. Landing Download Zero and fallback
links open the Download page. Old `/learn#downloads` links redirect for compatibility.
Verified platform availability and frozen release bytes remain unchanged.

## Header theme control — owner correction, 2026-10-13

Tutorials and Downloads replace the Appearance selector with a single circular
header icon. Moon switches to dark, sun switches to light; accessible labels name
the next action. Default to OS preference until a choice is saved. Narrow and
enlarged layouts allow header wrapping while preserving the44px controls.
Native VSCode adaptation, Hub and frozen0.5.8 remain outside this change.

## Viewport layout — owner correction, 2026-10-13

Tutorials and Downloads use the full available screen width and at least its
height. Remove the centered1200px shell cap; header stays at the top and main
fills remaining height. Longer content grows normally with vertical scrolling.
Keep narrow-screen wrapping, contained code and the mobile lesson/menu controls.

## Minimal extension sidebar — owner approval, 2026-10-13

Keep one continuous Zero view; use native Explorer for files. Run/Stop stays at
the top. GitHub uses visible Sign in/username and New branch/Finish change beside
the branch. ZeroHub has Browse and Share project. Tutorials and Setup help move
to native overflow, Copy repository link stays in repository actions. Idle status
is empty. Existing local-practice, native authentication, reviewed Git/sharing,
simulation and published-release boundaries remain in force.

## Collapsible controls and file viewer — owner correction, 2026-10-14

This supersedes the earlier single-view/non-collapsible arrangement. Restore the
separate Files tree below a native collapsible Zero controls view. Keep Run/Stop,
GitHub and ZeroHub together; collapsing Zero leaves Files accessible. Native
Explorer remains available. Only simulation mode shows the static upload notice.
Native themes, local-practice restrictions and existing command/review guards stay.

## Flow audit fixes — owner request, 2026-10-14

The owner requested all five audited issues fixed. Keep the centered Downloads
stack with a concise setup link and metadata-derived platform/version requirements
below it. The later tutorial-card correction removes the initial-lesson setup
card; setup remains available through Downloads and Docs. Share your work uses the existing shared theme wrapper
and controls; this is no broader Hub redesign. Release bytes stay immutable.

## Tutorial repository workflow — owner decision, 2026-10-15

Tutorials use the same GitHub flow as original projects. At lessons0/3/8 students
create their own repository from the matching empty template, then clone their
copy. Remove local-only/tutorial-ZIP entry paths; keep optional media downloads
and original example ZIP alternatives. Native Start project opens the verified
template path. Templates not yet published stay explicitly unavailable. After
cloning, Run remains offline and independent of an active GitHub session.
Upload/branch reviews, explicit Publish and separate original ZeroHub contribution
rules remain. Preserve current visual design and ordinary Java.

## First visit — owner decision, 2026-10-15

The owner approved one Get started entry and a returning-student tutorial link.
Reuse the restrained shared theme and typography for the public four-step page;
GitHub preparation comes before download, but neither browsing nor downloads
requires website authentication. GitHub handles account creation/sign-in. Link
Downloads back to project creation after installation, and starting lessons back
to this guide. Template availability still follows verified publication metadata.
No account-state detection, website OAuth, forced completion gate, release metadata
change or deployment is part of this implementation.

## Setup wizard — owner correction, 2026-10-15

Show one short step at a time with one prominent action. The first screen has a
single Continue with GitHub link to GitHub's login/account-creation page in a new
tab, then installation. No website OAuth or verified account state. Preserve
Back/Next and bookmarked step URLs; existing sharing links open the final step.
Keep privacy/setup/sharing detail available through concise disclosures and
canonical guides. No forced-height or scrolling restriction.

## Single-page setup — owner correction, 2026-10-15

Supersedes the wizard: show four concise steps together with direct links for
GitHub sign-in/account creation, download/launch, owned project/clone and lesson0.
Keep GitHub separate; no website OAuth, automatic advance, progress state or
Back/Next controls. Preserve ordinary section anchors and optional help.

## Download first, connect on desktop — owner correction, 2026-10-15

Supersedes website setup steps: Home offers Download Zero, with no website sign-in.
Desktop Zero checks its VS Code GitHub connection, offers Connect GitHub when
needed, shows the existing account and leads to tutorial creation. Use supported
native welcome/consent controls, allow Later, and keep local Run available.

### Owner correction — direct platform downloads, 2026-10-15

Restore Mac Silicon and Windows ZIP download buttons on Home. Reuse the verified
Downloads component and release availability rules. Desktop GitHub welcome remains.

## Sidebar onboarding and density exploration — owner request, 2026-10-16

Expose Start tutorial and Clone repository in the existing sidebar. Start tutorial
retains its stable command ID; Clone repository opens supported native Git controls.
Keep the existing two-view controls/Files structure for this functional update.

Three visual density concepts are proposals pending selection: compact grouped
controls, flatter controls without GitHub/ZeroHub headings, and one continuous
controls/file-list view. The last requires integrating the file list into one
supported view rather than hiding VS Code host chrome. Detailed logs belong in
Zero Output/Problems with concise recoverable feedback retained in the sidebar;
no large status/headings/collapsible overhaul is approved by generating concepts.
Actual screenshot and concept paths are recorded in the ignored
.verification/sidebar-onboarding-20261016/design-options.json receipt.

### Selected refinement — 2026-10-16

Owner selected the third displayed concept: one continuous controls/file-list
view. They requested Git/GitHub terminology. Use Commit & push for the existing
commit-if-needed/current-branch push action, and Merge to main for the existing
reviewed merge/push-main flow; preserve the stable command IDs and confirmations.
Start tutorial is available in welcome/empty state and native overflow, freeing
its permanent row when a project is open. Clone repository stays visible. Remove
GitHub/ZeroHub section headings and the separate controls/Files view split through
one supported webview view. Keep short actionable state and Problems recovery;
long compiler details stay in Zero Output. Native themes and keyboard/file safety
remain acceptance requirements. The refined generated visual is linked in the
ignored design-options receipt; it is not native implementation evidence.

### Routine confirmations — owner decision, 2026-10-16

Commit & push proceeds from the commit-message input, showing repository and
branch there. Naming a new branch creates it directly. First/new-destination
Publish uses one short public-visibility warning; setup/upload continues without
a second confirmation. Repeat Publish revalidates and updates the same site.
Keep concise merge, delete and repository-replacement confirmations and all
underlying account, destination, source-drift, conflict and transport checks.

### Merge to main — owner decision, 2026-10-16

The explicit Merge to main button starts the guarded merge/push-main flow without
an additional confirmation. Preserve account/project/destination/source checks,
operation serialization, the pause to run after incorporating updated main,
conflict recovery and the separate optional local-branch deletion confirmation.

### Automatic finished-branch cleanup — owner decision, 2026-10-16

After confirmed Merge to main success, automatically delete the finished local
branch through the existing clean-main, exact-SHA, ancestry and atomic ref guards.
Do not add another confirmation or delete the remote branch. A refused cleanup
keeps the branch, preserves the successful merge outcome and shows a concise
notice with details in Zero Output. Failed/paused/conflicted merges skip cleanup.

### Quiet success feedback — owner decision, 2026-10-16

Show routine Git, repository-link, publishing, export and library results in the
existing accessible sidebar status and Zero Output. Remove success toasts. Keep
required choices, first-publication consent, warnings and errors. Preserve the
removed toast actions as native-theme sidebar buttons: Open app/Copy playable
link for the saved verified publication and Preview export/Save ZIP/Share export
for the current project's completed export. Reuse existing guarded commands.

### Brief result text — owner decision, 2026-10-16

Use short sidebar results: Pushed to main, Merged to main, App published, Export
ready, ZIP saved. Keep branch/library names when needed, and retain longer
technical details and guidance in Zero Output. Conditions needing attention still
include a clear next step, such as running the app after main updates or checking
Output when local-branch cleanup is refused. No action or guard changes.
## Tutorial reading hierarchy — owner correction, 2026-10-16

Remove Previous lesson prose and horizontal dividers from tutorial content,
including section and Next lesson borders. Keep numbered step titles prominent
on subtle theme surfaces, with existing disclosure controls and deep links.
The later correction below removes generic setup/continuation cards entirely;
lesson-specific optional notes stay muted and unboxed. Reuse approved light/dark
tokens. The sidebar and Next lesson action remain available.

## Docs sticky method names — owner correction, 2026-10-16

API category headings scroll with the document. Each method's name/owner row
sticks only while reading that method, below the shared desktop header or at
the top on phones. Reuse opaque theme backgrounds and preserve method links,
search, navigation and normal category styling.

## Subtle scrollbars — owner correction, 2026-10-16

Themed website scrollbar tracks blend into their scrolling surface, including
the page gutter. Use thin approved-gray thumbs and transparent tracks, retain
normal scrolling, follow light/dark/system preference and defer to system
scrollbar colors in forced-color mode.

## Remove generic tutorial help cards — owner correction, 2026-10-16

Remove the entire “First time?” card and all continuation cards containing
“If you have not started it yet”. This supersedes the earlier helper-card choice.
Keep Start project buttons on lessons0/3/8, the lesson instructions and specific
component/media notes. Those specific notes stay small, muted and unboxed.

## Tutorial Summary card — owner correction, 2026-10-16

Group the opening numbered actions and full Done checkpoint in a subtle Summary
card, with the target image beside it on desktop and below it on narrow screens.
Remove the redundant short description under the lesson title. The source's bold
opening goal need not repeat above the card; authored lesson source stays intact.
This card contains the current lesson's actions, not generic setup/continuation
hints, which remain removed.

## Lesson title card — owner correction, 2026-10-16

The target image belongs inside the same card as the numbered actions and Done
checkpoint. Use the lesson title (for example, “Lesson 1: Say hello with a button”)
instead of “Summary”, with no duplicate title above. Give the whole card a subtle
purple tint using shared theme tokens; retain desktop columns and phone stacking.
This supersedes the preceding Summary card layout.

## Lesson title and encouragement — owner correction, 2026-10-16

Restore the large lesson title directly below the project heading and label the
card “Summary”. Keep its tint and contained image. End each lesson’s final code
and explanation section with short encouragement, such as “You wrote your first
Zero program!” for lesson0. This supersedes the lesson-title-inside-card choice.

## Summary card contrast — owner correction, 2026-10-16

Summary cards must stand out from the surrounding page, especially in dark mode.
Use a14% accent tint in light mode and24% in dark mode, including system-selected
dark. This supersedes the earlier8% tint; preserve readable text and links.

## ZeroHub cards — owner correction, 2026-10-17

Show only the latest available release per project. Titles are plain text; cards
have one tiny description, author/version, Play and GitHub. Remove the repeated
Games and libraries subtitle, Controls, source-project downloads, release internals
and per-card hosting note. Put student hosting once at the top. Keep library
usage behind a disclosure and existing exact-version links working. Square
screenshots are required for new game submissions; retain existing releases.

## ZeroHub scope — owner correction, 2026-10-17

Remove Starters from the ZeroHub catalog: its Hello/Study/Coin examples overlap
with Tutorials. Show only Projects and Libraries, default to Projects, and make
Share your work a separate button. Preserve named lesson/example links (including
Drawing pad) without promoting a duplicate starter/example collection.

## Docs category navigation — owner correction, 2026-10-17

Alphabetize the API sidebar categories by their displayed category name. Keep
the reference content, method order within categories, search and direct links.

## Retire duplicate projects — owner correction, 2026-10-17

Remove the public starter/example collection and its links/downloads entirely,
including hidden legacy detail pages. Redirect old example URLs to Tutorials.
Keep lesson sources with the lessons. Drawing Pad becomes a regular Projects
entry backed by the existing codepetca/zero-drawing-pad repository, with a square
actual-app screenshot and GitHub source. Add Play only after verified public
hosting. This supersedes the earlier decision to preserve named example pages.

## Tutorial-first onboarding — owner approved, 2026-10-19

The owner’s novice smoke test found that opening the completed bundled starter
with lesson 0 made it look as if students had already done the exercise. Fresh
launches now open an empty window with Start tutorial as the primary action.
The welcome uses one Start tutorial choice, connects GitHub when needed, and
continues to repository creation. Cancel keeps the sidebar action available.
Student clones open Main beside Tutorials. Preserve existing student sessions.
Keep the completed starter under Setup help → Test installation, in a separate
window labelled Installation test with Run test. It does not auto-open a lesson.

## Guided GitHub project access — owner approval, 2026-10-20

For the next release candidate, keep the native **Start tutorial** welcome and
existing device sign-in and credential handling. Before the tutorial picker or
repository name/location fields, do a read-only check of the current personal
account's Codepet App access for repository creation and contents writing. If
missing, show the native **Install Zero for GitHub** picker; **Open
GitHub** launches the pinned App page, where the student approves selected
repositories. Never request all-repository access. App-created repositories gain
access automatically. On return, recheck and continue to the tutorial picker;
keep **Check again** as fallback. Escape cancels and leaves Start tutorial
available to retry. Network or account drift during recheck never creates a
repository. Direct palette **Sign in** also guides access and reveals Zero.
Reopening Zero reveals its sidebar while preserving editor tabs and work. Keep
the completed starter at Setup help → Test installation, separate from tutorials.
This is an interaction-flow change only; website visuals are unchanged.

Owner follow-up: keep the native App prompt short: **Install Zero for GitHub**,
with Open GitHub and Check again. Keep permission explanations in setup help.


## Stateful first-run sidebar — owner approval, 2026-10-20

Mac 0.5.25 replaces the tutorial welcome modal with a minimal sidebar
sequence: **Sign in to GitHub** → **Install Zero for GitHub** → **Start tutorial**.
Sign-in retains existing device authorization and credentials, runs a read-only
App-access check, then stops at the next visible step. The install action opens
the pinned App page after a recheck; Check again remains a fallback. Return to
Zero to unlock Start tutorial. Keep the current step visible on cancel or failure.
A saved session receives a read-only launch check without a browser or sign-in
prompt. The ready empty sidebar makes Start tutorial primary, with New project…
secondary for skipping; Open local project and Setup help remain available.
Local Run and Files remain available signed out/offline, while cloud repository,
push and sharing controls wait for readiness. Tutorial reading state persists
locally per workspace/project path (lesson, scroll and disclosures only); it does
not track completion or grading. All tutorials can return to the first lesson
without changing code. Starting a tutorial creates a separate repository.
Earlier Mac downloads and the Windows 0.5.21 preview/manual ZIP retain their
bundled behavior. Website visuals do not change.


## Direct tutorial instructions — owner correction, 2026-10-20

Remove the short three-step summary and Done checkpoint from every tutorial.
Show the full instructions directly without the Code and explanation title or
collapse control. Number editing and testing actions, with copyable code beneath
the relevant instruction. Retain setup/reopen prerequisites and expected results
in that detailed sequence. Keep completed Compare your code references optional.
Apply the same authored lessons to website and bundled editor; preserve Java,
student work, navigation and locally saved reading position.

## Project menu simplification — accepted 2026-10-20

Ready welcome shows Start tutorial plus one Project menu: New project, Clone
project, Open local project. Remove duplicate welcome links and the empty Project
repository control. Open projects keep their repository-name menu for contextual
actions. Troubleshooting replaces Setup help and lives in the native ⋯ menu;
it retains prerequisites and the bundled installation test. Account and repository
actions remain in ⋯ for empty-window account changes and creation recovery.
