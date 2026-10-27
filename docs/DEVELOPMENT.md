# Development

Canonical repository: `https://github.com/codepetca/zero`, integration branch `main`.
Publish through a reviewed feature PR only with user authorization. Never deploy,
push, publish or change account credentials without explicit authorization.
There is no required external service or private environment file for local app
work. Keep one writer per component and inspect changes before integration.
Follow [AI workflow](AI-WORKFLOW.md) for delegation/review and recovery.
Record compact durable delivery evidence in [EVIDENCE.md](EVIDENCE.md).

## Default iteration loop

Owner preference,2026-10-22: use Zero Dev for routine UI/framework/game changes.
Reuse the appropriate active checkout/profile and useful caches. Run `npm ci`
when dependencies need installation, then keep `npm run dev` running while editing.
Reload the Dev window for extension changes; Stop/Run for framework or game edits.
Use the live component preview for UI states, focused tests for each change, and
`npm run dev:smoke` for game/framework integration. Record actual native evidence
and any untested platforms. Local iteration needs no version bump or installer.

Finish implementation, focused validation, independent review and documentation
before the final CI push where practical. Fixes still require checks and review;
reuse valid evidence for unchanged code. Build installer candidates when testing
packaging/setup/update behavior or preparing an authorized release. Source merges
alone do not require an installer release.

The [CI selection guide](FAST-DEV-FLOW.md) describes the affected-check matrix,
PR cancellation, browser reuse and version-keyed dependency caches. Unknown/shared
inputs and manual full-suite dispatches retain full coverage. Merge only after
the stable final gates and all selected jobs pass for the reviewed commit.

## Commands

For daily UI/framework iteration, use [Zero Dev](ZERO-DEV.md): `npm run dev`
opens an isolated source extension host and a playable game, watches generated
framework/UI inputs and serves the auto-refreshing component preview.
`npm run dev:smoke` runs local game/framework/UI checks without building an installer.

Use Node.js 22+ for developer tooling. Students use a supported JDK 17+ and
VS Code; Git 2.31+ is needed for authenticated uploads. Native Run needs no
Node.js or global Maven. The unreleased project-owned browser builder uses
standalone Node22 and JDK21. Its current local host discovers existing tools;
the classroom kit must provision its own private Node runtime before release,
so installing global Node is not the normal student setup path.

```sh
npm ci
npm run prepare:starter
npm run prepare:lessons
npm run check
npm test
python3 scripts/verify-examples.py
node scripts/verify-lesson-projects.mjs
node scripts/verify-project-progression.mjs
npm run package
npm run verify:kit
npm run verify:framework
python3 scripts/verify-examples.py --only sprite-playground audio-playground
```

Java build and finite GUI checks are documented in
[the student starter](../student-template/README.md). Builds use the pinned
project wrapper; do not require students to install Maven or Gradle globally.
Packaging creates local artifacts in `dist/` and does not publish them.
Guided setup is documented in [SETUP.md](SETUP.md). `npm test` includes launcher
fake-tool tests; focused checks use `node --test setup/tests/setup.test.mjs` and
`node --test extension/test/setup.test.js extension/test/setup-ui.test.js`.
Windows native setup contracts use `node --test setup/tests/windows-native.test.mjs`.
Set `ZERO_TEST_PWSH` to an existing test PowerShell executable to run its parser and
mocked backend checks; otherwise those runtime checks are explicitly skipped.
PowerShell 7 on a Mac is useful for these fakes but does not verify Windows
PowerShell 5.1, policy, installers or WinForms. The net48/Mono backend harness is
documented in [INSTALLER.md](INSTALLER.md); actual Windows testing remains separate.
Do not run installer actions against developer tools/accounts as a test. The
packaged kit generates setup metadata from the release definition, ships shell
launchers with executable permissions and excludes maintainer setup tests.
A published kit version is immutable: packaging refuses to overwrite it. Set a
new local kit/extension version before building the next release. Existing
public asset URLs/checksums remain pinned to their release. See
[release preparation and publication](RELEASING.md) for the one-command publisher
and its read-only CI preparation workflow.

The Windows0.5.18 local candidate uses native private-runtime setup and pinned
Velopack packaging. See [Windows installation and updates](WINDOWS-INSTALLER.md)
for .NET8+ tooling, repository-local `dotnet tool restore`, `npm run test:windows`,
signing/feed preparation and actual-Windows acceptance. The owner authorized
publishing the unsigned 0.5.21 installer preview on 2026-10-19, with automatic
updates disabled and interactive Windows testing explicitly pending. Signed
production releases still require their existing acceptance gates.

Native development installers are built locally with `npm run package:installers`.
This rebuilds and verifies the kit, then produces a universal macOS app/DMG and
an x64 per-user Windows Setup EXE plus full update package in ignored `dist/installers/`. Platform-only builds use
`node scripts/build-installers.mjs --platform macos` or `--platform windows`
after packaging/verification. macOS requires Xcode command line tools and
`hdiutil`; Windows cross-builds use the .NET SDK and the pinned build-only
.NET Framework 4.8 reference package. Students need no .NET SDK. Run packaging
tests with `npm run test:installers`; platform harness commands are in
[INSTALLER.md](INSTALLER.md). Default builds involve no signing credentials or publication. Explicit, separately
authorized Mac signed-build commands and verification are in [INSTALLER.md](INSTALLER.md);
signed mode reuses the existing kit and does not perform notarization. Styled Mac DMGs from0.5.14
also use a maintainer-only, hash-pinned Python helper for Finder metadata:

```sh
python3 -m venv .verification/native-installer/dmg-layout-venv
.verification/native-installer/dmg-layout-venv/bin/python -m pip install --require-hashes --only-binary=:all: -r scripts/mac-dmg-layout-requirements.txt
```

These dependencies stay in the ignored build environment; students need no Python.
Sparkle dependency extraction requires maintainer Python3.12+ with safe tar
filters. The builder probes the existing DMG-layout virtual environment, then
standard Homebrew/ambient interpreters, rejecting Apple's older CLT Python with
a useful error. Set `ZERO_MAC_BUILD_PYTHON` to an explicit absolute Python3.12+
path when needed; an explicit unsupported selection fails rather than falling back.
The builder writes the owned image's metadata without Finder automation. Actual
Finder chrome can follow user preferences; inspect a real mounted image before
accepting a layout. Production verification checks its hidden files, exact saved
layout, background pixels, native background alias and HFS+ open-folder metadata.


Framework contributors edit `framework/src/main/java/zero/`. Prepare assembles
ignored readable copies into the starter; checks/packaging prepare them too.
An edited generated copy is preserved and stops preparation rather than being
silently overwritten. Move intended upstream edits into the canonical framework
or save them elsewhere before preparing again. The extracted student kit needs
no preparation tooling. `verify:framework` uses a disposable starter and the
maintainer harness in `framework/checks/`.

## Website

The selected front-page design is recorded in [design/WEBSITE.md](design/WEBSITE.md).
The Next.js package has its own pinned dependencies and lockfile:

```sh
npm ci --prefix website
npm run typecheck --prefix website
npm test --prefix website
npm run build --prefix website
```

The website uses the current kit when published, or the last verified published
kit in `release/published-kit.json` while a newer kit remains local. The fallback
is validated as published and no newer than the current version; its explicit
GitHub URLs, sizes and hashes must first be checked without authentication. A
missing fallback retains the availability explanation. To preview a new
local version, set its release metadata to local, run `npm run package`, then
start the website from the root with:

```sh
ZERO_LOCAL_DOWNLOADS=1 npm run dev --prefix website
```

Without the local preview flag, an unpublished kit uses the verified fallback
when present. Published assets keep their verified public links
even with the flag enabled. No guessed public release URL is shown.
The optional `release/installer.json` adds **Download for Mac Silicon** on the Download page.
When that installer is published or local downloads are enabled, the public
Download Zero action on Home opens platform choices at `/downloads`. Mac setup
and the unsigned Windows installer preview are the visible download controls, with no
extra instructions or version prose. The complete ZIP, starter and VSIX remain
available on GitHub releases with their own kit version, even when Mac setup
and the published ZIP are different versions. Local-preview controls are labeled
as such; unavailable platform buttons are omitted. The unsigned Windows button
and its security-warning note are driven by strict `release/windows-preview.json`
metadata. A signed Windows manifest takes precedence; the preview never supplies
an update feed. Its optional strict `manualSetup` asset describes the byte-matched
embedded kit, published separately under `windows-manual-v<version>` without
changing earlier release assets. The secondary manual link is hidden if a signed
installer replaces that preview. Without either installer manifest, Windows falls back to the
published complete-kit ZIP. The current MVP supports Apple Silicon Macs and Windows.
Local native download verifies bounded exact bytes, clean signed/notarized build
provenance and unchanged packaged/native source. `VERCEL` always disables local
filesystem downloads even with the preview flag set. A hosted build reads only
the authored manifest; it needs no `dist/` files or build receipt.

After source review/commit, `npm run release:prepare:mac` seals the existing signed
Mac artifact and three kit files locally without rebuilding. See
[RELEASING.md](RELEASING.md) for clean-source requirements and the separate native
publication plan. Focused checks: `npm run test:release:mac` and
`node --test website/tests/installer.test.mjs`.

The website prepares canonical docs/release content before development and build;
generated snapshots and caches are ignored. Start here before later Vercel setup:
Root Directory `website/`, with repository sources outside that directory included
for build preparation. See [the website plan](WEBSITE-PLAN.md).

Open this repository in VS Code and launch the `Zero Extension` debug
configuration (F5) to use an extension development host. The host opens
`student-template/`. Use **Zero: Show Sidebar** if needed. Test a local VSIX in
an isolated VS Code user-data/extensions directory before normal installation.

## Verification posture

Check the two startup paths, useful lifecycle errors, JavaFX event/state behavior,
explicit object updates, drawing/input and shutdown. Preserve text control input
when a game includes controls. Check that the scored quiz and practice copy the canonical
ScoreDisplay unchanged and that the caption constructor preserves existing apps.
Study checks should exercise retries, duplicate scoring, advance/completion and
restart, including a second run. Keep question data in ordinary Java objects.

Test project resolution, Git URL parsing/root guards, simulation side effects,
Zero GitHub App authentication states, review cancellation, account/session drift and
credential isolation. Git/authentication tests use mocks and intercept transport;
no real sign-in, upload or account/configuration changes are authorized by a
local development check. Live is the student default; simulation tests must explicitly select it. Signing in is separate
from manually configuring per-repository Git commit identity.

The individual workflow uses reviewed local start/finish and explicit update plans.
Test actual local Git with injected disposable bare remotes: local/main/feature
updates, multi-hunk text choices preserving automatic merges, binary/deletion and
native-only cases, cancellation/reload, checkpoints and exact-SHA confirmation.
No production URL rewrites or credential changes are permitted. Simulation must
skip saves, auth, network and Git mutations for all new recovery actions too.
Transport accepts only reviewed HTTPS destinations and narrow push/head-query/
SHA-pinned-fetch commands with session/root/rewrite guards. UI checks cover stale
choice tokens, unsaved editor buffers, serialization, signed-out local work,
checkpoint cancellation and Source Control return. An explicit owner-authorized
live pilot is separate from the injected fixture service; report both accurately.
Managed recovery metadata is local to .git and stale operation locks require
native review rather than automatic deletion. PR integration remains deferred.

Run `git diff --check` before handoff. Record checks actually performed in
[VERIFICATION.md](VERIFICATION.md); configuration/ZIP checks alone do not prove
editor behavior or a real upload. Physical Windows and novice pilots remain
pending. Use [CLASSROOM-PILOT.md](CLASSROOM-PILOT.md) for a teacher-authorized trial.

## Dependencies and contributions

Follow [project versioning/preservation](FRAMEWORK-ARCHITECTURE.md#project-versions-and-preservation):
project-owned framework/build source and exact version records independent of
editor updates; one maintained current line with no required central historical-kit
storage/database. Same-major compatibility uses a small representative regression
set, not all-version CI/old branches. Retained web output and optional student-owned
offline bundles use existing artifact formats. Current source includes project-owned browser tooling, trusted launch and
data-only retained-output validation. The local clone/rebuild/rehost and explicit
copy-upgrade/rollback proof passes; released kits retain their bundled behavior.

Pin JavaFX, Maven wrapper/distribution and npm tooling; commit the npm lockfile.
Keep generated artifacts and caches out of Git. The framework source ships inside
the starter so students can inspect and edit it. App builds ordinary JavaFX
interfaces; GameApp adds canvas animation. Keep explicit object updates and
ordinary controls/layouts available rather than introducing a larger engine.

Start with one readable helper, example or useful error. Put alternative examples
outside compiled `src/`; use the three minimal project scaffolds for continuing
student-owned tutorial repositories. Completed teaching checkpoints are maintainer fixtures only. For shared
components, start from `examples/shared/ScoreDisplay.java`, test exact-copy reuse
in quiz, practice and study, retaining the caption enhancement and existing
no-argument constructor. Include meaningful behavior checks and a short explanation
another student can follow; seek review before cohort adoption.

Advanced contributions can introduce ordinary Java packages/interfaces when a concrete app needs them. Shared libraries and automated submission are described in [COMPONENTS.md](COMPONENTS.md). Original source uses [MIT](../LICENSE); upstream notices retain their terms.

## Maintained libraries

`python3 scripts/verify-starter-ui.py` and `python3 scripts/verify-health-bars.py`
verify maintained sample JARs and their consumers. Sample source remains in Zero;
student contributions remain in their existing game repositories.

## GitHub sharing

Run `npm run test:sharing` for registry, ZIP and immutable publication contracts. Native student integration tests run with `npm test`. See [the adoption plan](GITHUB-SHARING-PLAN.md), [shared contract](../sharing/CONTRACT.md) and [website configuration](../website/README.md). The former Hub service, database dependencies and upload/OAuth adapters are removed. Managed library checking uses `hub/checker/` through a separate default-off workflow; enabling publication requires the acceptance and rollout procedure below and in [sharing operations](SHARING-OPERATIONS.md).

Run `node scripts/verify-sharing-consumers.mjs --output .verification/sharing-consumers-new` for two real Maven consumers over scoped local HTTPS. Use a fresh output directory; no global trust is changed. Packaging reads reviewed `release/sharing.json` containing schema, catalogUrl, artifactOrigin and publisher policyRevision. Local and CI builds preserve its exact bytes; release/kit/native provenance checks reject stale or substituted settings. Environment overrides do not select release settings. Students receive verified settings with the kit, not manual hash-copy instructions.

For the unreleased core-dependent ScoreView path, prepare a fresh owned fixture
with `node scripts/verify-core-sharing.mjs --prepare --output .verification/core-sharing-new`.
Then run the same command with `--run` instead of `--prepare` for the independent
core/contribution JAR check, local and exact-artifact native App/GameApp consumers,
source attachments and unused-call compatibility negative. Add `--web` for four
actual WebFX exports. This is a finite local HTTPS proof with scoped temporary
trust and an isolated Maven cache, not hosted checker acceptance or publication.
The no-option command only prints usage. Browser interaction receipts are a
separate acceptance step; successful export alone does not establish playability.

## Shared Learn and sidebar design

`design/tokens.json` and `design/adapters.mjs` are the shared source. Run
`npm run prepare:design` for local artifacts and `node design/prepare.mjs --check`
to detect drift. Website preparation/build, root checks/tests/packaging and the
VS Code development launch generate the required CSS automatically. Generated
`website/.generated/learn-theme.css` and `extension/media/generated-theme.css`
are ignored by Git; VSIX packaging includes the extension CSS. Do not edit these
outputs or rebuild the frozen 0.5.8 artifacts to test styling.
The shared header profile dropdown contains GitHub sign-in/account actions and
the light/dark toggle. The OS
preference is the default until a mode is chosen; the choice persists. ZeroHub and Docs use the same themes.
Downloads live at `/downloads` and on Home, reached through the Zero logo. The
shared menu contains Tutorials, Docs and ZeroHub. Old
`/learn#downloads` links redirect there for compatibility.
The sidebar uses native host colors/fonts/focus and high-contrast classes.

Tutorials now opens lesson 0 directly at `/learn`, with all thirteen lessons in
the desktop sidebar and a lesson selector on narrow screens. Sidebar selection
updates the reading pane and bookmarkable lesson URL; there is no overview landing.
The tutorial reader shares the approved appearance controls with Downloads.

Docs opens the searchable API. Tutorials contain the learning explanations.
Setup/new-project help and teacher notes use separate, small reader navigation
under `/help` and `/teachers`; the reader never lists the entire document map.
Legacy guide routes resolve through `website/lib/document-navigation.mjs`,
including chapter bookmarks. Keep migrated destinations and anchors covered by
`website/tests/document-navigation.test.mjs`. Source guides remain in the kit and
repository for older links and advanced contributor reference.
ZeroHub opens Projects by default. Its desktop sidebar contains the title,
search, Share your work and Projects/Libraries filters; the gallery is on the
right. At 800px and below controls stack above the gallery. Search keeps an inset
magnifying glass. Maintained project metadata lives in website/content/projects.json;
Drawing Pad links to the verified codepetca repository and an actual square
browser screenshot. It has no Play URL until public hosting is verified.
Maintained entries are independent of community admission and remain visible
when the shared catalog is unavailable; exact release links never substitute one.

The public starter/example gallery, detail pages and generated ZIPs are retired.
`/examples`, `/examples/[slug]` and legacy example selectors redirect to Tutorials.
Website preparation removes stale public example downloads and their snapshot;
it continues to prepare canonical docs, lessons, source views and lesson media.
Internal lesson/example sources remain available to teaching and verification.

The example generator, preview capture and template publication metadata remain
maintainer tools. Run `node scripts/prepare-project-templates.mjs` to prepare
legacy local template drafts; use `npm run prepare:tutorial-templates` (or the
same script's `--tutorials` option) for the three current minimal tutorial drafts.
Run `npm run check:tutorial-templates` to check recorded publication source
evidence, or `node scripts/check-tutorial-templates.mjs game /pristine/template`
to check a local draft's exact files/bytes/modes. All three templates were updated
through reviewed PRs and their anonymous public archives passed exact-source
verification on2026-10-24; publication records include the verified commit/tree
and scaffold digest. Future updates require the same separate authorization and
verification before stamping evidence. This does not
generate public website downloads or publish
repositories. Publication remains a separate authorized action. Never copy the
development repository or private files into a draft. Generator checks use
`node --test website/tests/example-projects.test.mjs`; website tests also cover
maintained-project search, exact-release exclusion and retired link behavior.
New Start tutorial checks the bundled template's recorded source digest before
creating a repository. Old Open/Clone/Run remain independent; no project is
upgraded. This evidence check is not live verification of mutable remote main,
and direct GitHub template creation/manual Clone can still select old content.
`npm run package` requires coherent recorded tutorial evidence before generating
release assets. `npm run verify:kit` also checks the actual VSIX tutorial bundle
for readiness and exact parity with current scaffolds and publication records.
The existing packaging CI lane enforces these checks. Even notice-only changes
inside a scaffold require verified template publication and refreshed records
before another installer is packaged; never stamp a digest from local drafts as
proof of publication. Local editing and existing student projects remain usable.
Community catalog admission policy and its installed clients are unchanged.

## Browser export

Target architecture: normal student code uses Zero facades rather than requiring
JavaFX imports. Follow [the class model](FRAMEWORK-MODEL.md) and
[reliability plan](FRAMEWORK-RELIABILITY.md) for proposed App/GameApp ownership,
per-signature evidence, background compatibility and local runtime status.
PostHog/Clarity evaluation grants no new collection or activation authority.
The released Run/export behavior is described below; current source adds the
project-owned builder and local reliability status described in those plans.

See [WEB-EXPORT.md](WEB-EXPORT.md) for the implemented WebFX/GWT teaching profile,
explicit browser export/preview, deployment-only publishing kit and strict
resolved-API gate. Normal Run App, setup Run test and the configured Zero run task
use the project Maven wrapper for native JavaFX, without browser compatibility
checking or WebFX compilation. Publish app and advanced Export for web retain
the full browser production build and validation. Mac 0.5.43 ships native Run;
earlier downloads retain their bundled behavior. Run
`npm run test:web` and `npm run verify:web` when changing these boundaries.
`npm run check` rejects unreviewed helper inventory/fingerprint drift.

The Mac 0.5.43 Run split button keeps native Run/Stop as its primary action.
Its arrow opens Publish app for a ready, connected project and is disabled during
Run/Stop. It shares anchored-menu keyboard/focus behavior with New; both menus
are mutually exclusive. Focused checks include `extension/test/run-dropdown.test.js`.
The design fixture accepts `/sidebar?connected=1` for safe publishing-menu review.

Native Run uses a separate Zero compiler diagnostic collection, reset when the
next native task starts. It parses compiler output until Maven starts the JavaFX
run goal and retains errors after a failed task exits or Stop. Verify recovery by introducing a
syntax error, following its Problems link, fixing it and running again: the old
error must disappear before Stop. Runtime failures retain their separate
diagnostic collection. The standalone “Run App without Zero” task keeps its own
bundled matcher and is outside this editor-managed behavior.
VS Code preserves configured matchers over a provider's resolved matcher, even
when the provider returns an empty list. The legacy `$zero-java` name therefore
remains as an inert compatibility matcher under a separate owner; existing Zero
task files need no rewrite. Compiler Problems come from CustomExecution, available
in all supported VS Code versions. The programmatic non-CustomExecution fallback
uses `$zero-java-fallback`; a configured task on a host without CustomExecution
does not gain that fallback matcher. The standalone inline matcher still works.

Configured task resolution is description-only. VS Code calls it while listing
choices and during project startup, so it must not save files, stop an app or
clear Problems. The CustomExecution start callback launches the same native Run pipeline as the
sidebar, which rechecks trust, project identity, cancellation and busy state.
A refused/cancelled callback returns a finite terminal without replacing the
running app or resetting its diagnostics. Configured tasks require CustomExecution
(all supported VS Code versions provide it); programmatic fallback remains
separate. Verify by opening **Tasks: Configure Default Build Task** while a game
is running: opening/cancelling the picker must preserve that app and readiness.
The configured task finishes its launch request; the separate app task owns the
compiler, Java process, readiness, Problems and Stop. This allows repeated build
shortcuts to restart the app while keeping one preparation implementation. The
launcher's completion is not a claim that compilation has finished. Actually
starting the configured task retains normal save/restart/Stop behavior.
Each editor-launched native Run has a fresh internal task `instanceId`, registered
in the extension's task definition. Leave it out of student tasks.json. VS Code
normalizes task identity using registered fields; this separates a live app from
a refused configured retry so the retry cannot clear the live app's Stop owner.



The supported `zero.controls` webview in Explorer contains development controls
and teaching helpers; native Explorer owns the file list. Native `zero.startPage`
opens one reusable/restorable editor panel
for onboarding, tutorial/project choices and account-scoped recents. Empty Zero
windows open it automatically without replacing existing editors.
`zero.getStarted` remains a compatibility alias. The native **⋯ → Start Page**
and Command Palette reopen it. `zero.startProject` still starts the existing
guarded tutorial workflow. Sign-in/setup live on the Start Page; local Run/Files
remain available offline. Cloud actions unlock only after access is ready.
Current source groups project choices under **Project ▾ → New / Clone / Open**,
using the existing guarded commands/folder resolution. The equally wide
**Start tutorial** split button starts a project on its main click; its arrow
contains **Tutorials**, which invokes `zero.openFirstLesson`, including its project-free reader, without sign-in
or repository creation. The menu supports arrows, Home/End, Escape, Tab and outside
dismissal, skips disabled items and preserves focus through status/account updates.
Recent entries remain directly available. Mac0.5.45 ships the Project dropdown and Start tutorial split control.
Clone asks for a GitHub URL and a parent folder starting at `~/Zero Projects`,
with another location selectable. Zero remembers the selected clone parent in the
local editor profile for future clones; cancelling the picker or opening a local
project leaves that choice unchanged. An unavailable saved folder falls back to
`~/Zero Projects`, then home if necessary. The unreleased shared-identity source uses Zero’s guarded authenticated clone and
opens the returned folder in the current VS Code window using supported
`vscode.openFolder` with `forceReuseWindow:true`. Local and recent project opens
use the same window policy. Creation recovery stays saved through the switch: vscode.openFolder can resolve
after a native unload veto. Clear it only after the matching account/repository
project is the actual active workspace. It requires the pinned Codepet App
configuration and never falls back to the built-in broad GitHub OAuth provider.
General Git/terminal network actions do not inherit Zero’s credentials by default;
see the [opt-in native Git prototype](#native-git-sign-in-prototype). Open local project
validates and opens an existing Zero folder without cloning, moving it or creating
the default folder. Website/tutorial instructions use these visible labels.

Current source carries an open Start Page across a project switch with a local
profile handoff written before `vscode.openFolder` restarts the extension host.
Only a different host opening the exact destination consumes it; an abandoned
handoff expires after ten minutes. Failed opens remove their own handoff. Restore
the page before first-lesson introduction so Main and Tutorials can open normally;
the Start Page alone does not count as a student editor. Existing destination
editors are preserved, and an already restored Start Page is reused. No files from
the previous project are carried over. Focused coverage includes
`extension/test/project-window.test.js` and `extension/test/onboarding.test.js`.

Windows signing-account choices and private feed-key custody are documented in
[Windows signing](WINDOWS-SIGNING.md). Use [Windows trial](WINDOWS-TRIAL.md) for
the disposable real-install smoke and owner acceptance checklist; configuring CI
is not a passing Windows run.

## Library checker acceptance

Current-format library checking and its managed job/publisher separation are
specified in [the shared contract](../sharing/LIBRARY-CHECKING.md). Local Check
and hosted acceptance remain separate. Build the fixed image before candidate
input; use actual Linux architecture evidence rather than a Mac image identifier
as managed-runner proof:

```sh
node hub/checker/build-image.mjs
node --test sharing/test/library-checker.test.mjs sharing/test/managed-library*.test.mjs
ZERO_DOCKER_TEST=1 node --test hub/checker/test/docker.test.mjs sharing/test/library-checker-docker.test.mjs
```

The unprivileged **Library checker acceptance** GitHub workflow builds/tests on
Linux AMD64. Its successful fixture run alone does not publish a library or
activate the managed publication gates. Native student UI and a public exact-JAR
consumer require separate actual acceptance.

## Shared GitHub identity (unreleased)

See [the identity plan](ZERO-IDENTITY-PLAN.md) for the one-App permission matrix,
implementation phases and production activation gate. Codepet Zero is registered
as the public [`codepet-zero` App](https://github.com/apps/codepet-zero) under
`codepetca` (owner ID `116690057`). Its configured public metadata is pinned in
`extension/src/github-app/config.json`: App ID `5367740` and client ID
`Iv23liWzC8OE2WN5f6qV`. Registration enables device flow and expiring user tokens;
wildcard callbacks and webhooks are off, with no webhook events selected. Reviewed
permissions are Actions, Contents, Pages, repository creation, Workflows and
starring write, plus Metadata read. The source also accepts the reviewed optional
Administration write grant needed to create a missing Pages site. It is requested
only for that operation; existing-site deployment and other operations retain
their narrower checks. See the staged rollout in ZERO-IDENTITY-PLAN.md.
Registration and pinning do not prove installation, device authorization, token
issuance or live acceptance. The source remains unreleased and local Run stays
available without a connection. The extension registers the supported
`zero-github` provider and keeps expiring token pairs in SecretStorage,
with no shipped client secret. Current local source uses browser authorization
for new connections, with no code-sign-in command or fallback.
Browser-issued sessions renew through the server; schema1 records without a
flow marker keep the original device-code renewal route. Website OAuth uses the same client ID with
its own credential family and eight-hour reconnect policy. Browser sign-in remains
disabled without the required server credentials; registration did not provision
a client secret, private key or user tokens. The subsequent owner-approved native
flow issued its own user tokens. A selected test installation, native device sign-in, private clone and guarded
Commit & push have passed in an isolated Mac profile. The remaining live acceptance,
production activation and an authorized native release remain pending.

### Desktop browser sign-in activation (separate from publication)

The local implementation adds `/api/desktop/github/{start,login,callback,exchange,refresh}`.
It is disabled unless `ZERO_DESKTOP_GITHUB_ENABLED=1` and the existing
`ZERO_HUB_GITHUB_CLIENT_ID`, `ZERO_HUB_GITHUB_CLIENT_SECRET` and
`ZERO_HUB_GITHUB_SESSION_SECRET` configure the pinned Codepet App. The production
origin is fixed to `https://zero.codepet.ca`; a trusted test constructor supports
IPv4 loopback fixtures. Register the exact callback
`https://zero.codepet.ca/api/desktop/github/callback` on the App before separately
approved activation. No wildcard callback, new permission, database or central kit
storage is required. Do not enable the flag, provision secrets, change App settings
or deploy as part of local implementation checks.

A temporary IPv4 listener receives only an OAuth code and short-lived sealed
delivery ticket. PKCE and state/HttpOnly-cookie binding protect the exchange;
GitHub enforces one-use codes. The desktop sends its verifier over HTTPS to the
server, which holds the App secret for exchange/refresh. Tokens are returned in
no-store POST responses and retained in SecretStorage, never browser-return URLs.
The server does not retain desktop credentials. ZeroHub's separate browser
session is unchanged. Cancellation, timeout and disposal close the listener;
uncertain refresh outcomes require reconnecting instead of retrying a rotating token.

Local broker/GitHub fixtures verify the handoff and renewal protocol. Live GitHub
web authorization, deployed callbacks and physical Windows/Safari acceptance stay
unproven until their separate activation/acceptance work. Published desktop downloads retain
their bundled sign-in behavior; browser-only new connections require a separate
authorized release.

Focused native checks are `node --test extension/test/github-app-*.test.js`,
followed by the full extension suite. Mocked API/device-flow tests and disposable
local Git exercise lifecycle and authority guards; they do not prove real GitHub
permission consent, creation, refresh or Pages behavior. Those checks require the
registered App and disposable student-owned repositories. GitHub’s **Only select
repositories** installation form requires at least one repository; empty-account
onboarding has not been verified.


## Native Git sign-in prototype

Current local source includes a default-off credential adapter for the built-in
`vscode.git` APIv1 `registerCredentialsProvider`. Student controls keep their simple interface. New branch is local; Sync from
GitHub, Commit & push and Merge to main retain guarded transport.
This prototype does not migrate those actions to native Git or alter account
permissions, release settings or external-terminal authentication.

Test in a fresh isolated VS Code profile with no credentials or existing terminals,
and verify **no effective Git credential helpers** in the disposable environment.
A fresh editor profile still reads system, global and repository Git configuration;
it does not isolate Keychain or other credential storage. This helper prerequisite
is a maintainer check: the host-only credentials API cannot enforce it.
Use these **User Settings** before opening that window:

```json
{
  "zero.nativeGitAuthentication": true,
  "git.enabled": true,
  "git.useIntegratedAskPass": true,
  "git.terminalAuthentication": false,
  "github.gitAuthentication": false
}
```

The Zero setting has application scope; project/workspace opt-in is rejected.
The bridge requires workspace trust and an existing Zero sign-in. It never opens
OAuth or asks for a token, changes settings, or falls back to a different account.
Zero Output explains checked prerequisites. Disabled or unavailable Git APIs
leave ordinary Zero actions working; public Git enablement events retry delayed
initialization and invalidate registration when Git becomes unavailable.
Registering the bridge alone does not prove
which account native Git used: ambient Git helpers or another credential provider
can take precedence. Use a disposable repository with empty credential-helper
configuration and verify the actual account/access separately for live acceptance.

The API supplies a **host**, not a reviewed repository/operation. Credentials can
therefore serve native HTTPS `github.com` operations in that trusted window,
subject to GitHub's own token permissions. HTTP, SSH, foreign hosts, user information
and explicit ports are rejected. This has a broader boundary than Zero's exact
URL/SHA transport. Treat project execution as untrusted even after editor trust.
Terminal authentication is kept off; existing terminals can retain their earlier
environment, which is why a fresh window/profile is required. Other extensions
are outside this adapter's isolation guarantees.

Sign-out, account/trust/configuration changes and disposal stop new bridge credentials.
VS Code Askpass can retain a returned username/password pair for up to 60 seconds.
Separately, successful Git authentication can send that pair to configured helpers
for persistent storage. Such credentials may remain usable after sign-out until
the token expires or is revoked; 60 seconds is not an overall retention limit.
The bridge cannot clear helper storage, the Askpass cache or an in-flight Git
process. This is why empty effective helper configuration is required for prototype
tests, rather than just a new editor profile. If no
provider supplies credentials, VS Code may show its generic Git credential prompt.
Do not interpret that prompt as Zero sign-in or promise immediate native-cache
revocation. Routine Zero transport retains its separate synchronous final guard.

Local New branch performs no authentication or network operation and no full
source/asset hash. Explicit Sync reviews/downloads GitHub main without uploading;
main fast-forwards only, a feature can merge main and must be run again. Merge
preparation is local and execution performs only one nonforce push and one SHA
confirmation. Rejected stale-main pushes preserve local work and direct students
to Sync, Run and retry. Simulation remains mutation-free for all actions.

Captured operations reuse verified identity only within their private session
receipt. Every assertion still rereads locked storage and checks expiry. Upload
access is checked at the first actual transfer; the paired confirmation reuses
that operation's access while rechecking session/project state. Commit & push
pins identity before its input and compares again at transfer. New operations
always establish their own access; no blanket permission cache or OAuth fallback.

After confirmed success, git-tracking updates only the matching origin tracking
ref, with origin/root/ref/object guards and OID CAS. It suppresses reference hooks,
refuses partial/promisor clones to avoid implicit credential-bearing fetches, and
never changes upstream configuration, HEAD, source or index. Refused metadata
refresh is a warning after remote success. Git 2.31 cannot atomically verify ref
symbolic type: an unobserved last-moment symbolic replacement may itself be
replaced, but --no-deref prevents changing its target branch. Configuration can
also change after final inspection; the helper never rewrites it.

Focused checks:
`node --test extension/test/authentication.test.js extension/test/github-app-provider.test.js extension/test/github-app-browser-provider.test.js extension/test/native-git-authentication.test.js extension/test/workflow.test.js extension/test/git-tracking.test.js extension/test/workflow-ui.test.js extension/test/transport.test.js extension/test/extension-upload-auth.test.js`.
Mocked authority tests, real local bare-repository cycles and actual VS Code
credential callbacks are distinct from live GitHub upload acceptance. No release
or production activation follows from these tests.

## Shared branding assets

Editable SVGs live in [design/brand](../design/brand/README.md). Website
preparation copies the light/inverse marks and generates PNG browser/Apple/share
assets with pinned Sharp. Shared design preparation synchronizes the theme-aware
editor SVG from the canonical geometry. Native packaging reads the same geometry
and creates ICNS/ICO files only in build directories; Windows embeds the icon in
the executable and passes it to Velopack. Source changes do not replace released
installer bytes. Use the existing website/design/installer checks plus actual
light/dark web inspection; physical Windows icon rendering remains separate.

## Native Explorer integration

Local source defaults to the Student Explorer after the owner’s reviewed-preview
continuation on2026-10-26. **Zero: Use Standard Explorer** and **Zero: Use Student
Explorer** persist a workspace choice; an explicit Standard Explorer preference
is preserved on upgrade. An existing workspace receives the new sidebar once,
without replacing its open editors. The supported `zero-student-explorer` view container combines
`zero.studentControls` and the native `zero.studentProject` TreeDataProvider.
Both control views share the renderer but keep independent document lifecycles.
The student controls omit the ZeroHub and New dropdowns. The native Project
header keeps only the anchored **New (+)** dropdown for the selected folder.
Refresh, Show All Project Files and Collapse All live in Project’s three-dot menu. A
selected file targets its containing folder; without a selection, creation starts
in java. Its description and name prompts use the visible hierarchy, such as
**java › game › characters** or **Libraries › Health bar › resources**, while the
project keeps its ordinary Java source/resource layout. The dropdown limits
choices to that area. Right-click files or folders for contextual creation;
editable files also expose **Rename file…**. Rename uses a guarded native
WorkspaceEdit, refuses collisions/unsaved changes, and never moves files between
folders. Java file names change without rewriting class names or references;
the prompt explains that limitation. A local library with a basename/declaration
mismatch stays navigable and shows a repair hint; imports are withheld until
repaired. Namespace/path containment checks remain strict. Published retained
source remains read-only.
Project overflow retains ZeroHub's guarded browser. Actions revalidate current
project/tree targets before opening the name prompt. File creation then targets
the containing folder, revalidated before mutation; subsequent removal of the
original sibling file does not change that destination.
**Show all project files** opens the full Explorer without changing the selected mode;
the Zero status-bar action returns to the active controls. **Zero: Use Standard
Explorer** selects the standard layout. No host layout storage or private APIs are used.

java and resources map to actual source/resource roots. Selected file actions
re-resolve current project, Java package, local library identity and mode through
the authoring resolver. Installed dependencies have no editable source tree;
retained authored source in published mode is labeled inactive. Tree expansion
only reads bounded ordinary files. Exact published imports/examples require an
explicit catalog lookup, with no artifact download or dependency change.
Root-scoped file watching refreshes authored changes and ignores build output.

Focused checks: `node --test extension/test/student-explorer.test.js
extension/test/project-explorer-model.test.js extension/test/file-actions.test.js
extension/test/assets.test.js extension/test/file-rename.test.js
extension/test/project-menu.test.js extension/test/sharing-explorer.test.js
extension/test/sharing-editor.test.js extension/test/extension.test.js
extension/test/sidebar-refresh.test.js`. Use Zero Dev for actual light/dark,
keyboard, context-menu, error-recovery and project-switch acceptance. Native and
WebFX/browser proofs remain separate. No source publication or release follows.

Zero contributes the `zero.controls` webview to `contributes.views.explorer`.
`Zero: Show Sidebar` reveals Explorer and expands the controls using its generated
focus command. Existing marked workspaces receive this introduction once under
`zero.explorerShown`; the old `zero.sidebarShown` key remains for compatibility.
VS Code owns file selection, active-editor reveal, file watching and context actions.
No custom file-tree messages, provider or broad file-list watcher remains.
The New menu retains guarded Java class/file/folder and asset helpers.

Supported contribution APIs do not set the order of views inside built-in Explorer.
Users can drag the Zero header above the files and resize the divider once;
VS Code preserves that choice. Do not use private move/layout commands, modify
workbench storage or alter host DOM/CSS to force a placement. Native editor QA
remains held after the Code Key popup; mocks/browser fixtures do not prove actual
Explorer layout, file highlighting or drag/rename interactions.

## Embedded preview text selection

Mac VS Code can lose Cmd+A inside a nested webview input. The local embedded
preview uses a separate exact-token URL whose index response adds a focused
text-input/textarea selection handler. That embedded HTML is derived preview
infrastructure; the validated snapshot, exported ZIP, external browser page and
other assets remain unchanged. Ctrl shortcuts, clipboard commands and canvas
input keep their existing handling. This also applies to saved older exports
without upgrading the project-owned builder or framework.

Check `extension/test/web-run-preview.test.js` and repeat Sam → Cmd+A → Alex in
the actual Mac embedded field. URI serialization must preserve the exact preview
token. A mocked key event alone does not establish host keyboard acceptance.
