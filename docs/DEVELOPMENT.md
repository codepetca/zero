# Development

Canonical repository: `https://github.com/codepetca/zero`, integration branch `main`.
Publish through a reviewed feature PR only with user authorization. Never deploy,
push, publish or change account credentials without explicit authorization.
There is no required external service or private environment file for local app
work. Keep one writer per component and inspect changes before integration.
Follow [AI workflow](AI-WORKFLOW.md) for delegation/review and recovery.
Record compact durable delivery evidence in [EVIDENCE.md](EVIDENCE.md).

## Commands

Use Node.js 22+ for developer tooling. Students use a supported JDK 17+ and
VS Code; Git 2.31+ is needed for authenticated uploads. Students do not need Node.js or
global Maven.

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
an update feed. Without either installer manifest, Windows falls back to the
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

The individual workflow adds reviewed start/finish plans. Test real local Git
against injected disposable bare remotes: baseline, branch progress, main updates,
pause/run/review after updates, preserved conflict state, failed push/retry and
safe optional local branch deletion. Never redirect production transport through
Git URL rewriting or introduce a real GitHub test. Simulation must skip saves,
auth, network and Git mutations for Upload, Start and Finish. Native transport
accepts only the exact reviewed HTTPS destination and narrow push/head-query/
SHA-pinned-fetch commands; session/root/rewrite checks remain required. UI tests
cover cancellation, operation serialization, source-control guidance and drift.

Run `git diff --check` before handoff. Record checks actually performed in
[VERIFICATION.md](VERIFICATION.md); configuration/ZIP checks alone do not prove
editor behavior or a real upload. Physical Windows and novice pilots remain
pending. Use [CLASSROOM-PILOT.md](CLASSROOM-PILOT.md) for a teacher-authorized trial.

## Dependencies and contributions

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

## Shared Learn and sidebar design

`design/tokens.json` and `design/adapters.mjs` are the shared source. Run
`npm run prepare:design` for local artifacts and `node design/prepare.mjs --check`
to detect drift. Website preparation/build, root checks/tests/packaging and the
VS Code development launch generate the required CSS automatically. Generated
`website/.generated/learn-theme.css` and `extension/media/generated-theme.css`
are ignored by Git; VSIX packaging includes the extension CSS. Do not edit these
outputs or rebuild the frozen 0.5.8 artifacts to test styling.
Home, Learn and Downloads share a circular header sun/moon light/dark toggle. The OS
preference is the default until a mode is chosen; the choice persists. ZeroHub and Docs use the same themes.
Downloads live at `/downloads`. Download is a regular menu item. Old
`/learn#downloads` links redirect there for compatibility.
The sidebar uses native host colors/fonts/focus and high-contrast classes.

Tutorials now opens lesson 0 directly at `/learn`, with all thirteen lessons in
the desktop sidebar and a lesson selector on narrow screens. Sidebar selection
updates the reading pane and bookmarkable lesson URL; there is no overview landing.
The tutorial reader shares the approved appearance controls with Downloads.

Docs opens the searchable API. Setup and longer guides use the shared reader.
ZeroHub opens Projects by default, with Projects/Libraries and a separate Share
your work action. Maintained project metadata lives in website/content/projects.json;
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
local template drafts; this does not generate public website downloads or publish
repositories. Publication remains a separate authorized action. Never copy the
development repository or private files into a draft. Generator checks use
`node --test website/tests/example-projects.test.mjs`; website tests also cover
maintained-project search, exact-release exclusion and retired link behavior.
Community catalog admission policy and its installed clients are unchanged.

## Browser export

See [WEB-EXPORT.md](WEB-EXPORT.md) for the implemented WebFX/GWT teaching profile,
browser-first Run App, deployment-only publishing kit and strict resolved-API
gate. Run
`npm run test:web` and `npm run verify:web` when changing these boundaries.
`npm run check` rejects unreviewed helper inventory/fingerprint drift.

One supported webview (`zero.actions`) contains controls and the project file list;
with a single view VS Code merges its title into the container header. Start
tutorial (`zero.startProject`, stable command ID) is in welcome and the native
**…** menu. Signed-out GitHub controls show only **Sign in**; local Run and files
remain available. Signed in reveals the project dropdown with **Clone from GitHub…**
(`zero.cloneRepository`), **New project…** and **Open local project…** (`zero.openLocalProject`).
Clone asks for a GitHub URL and a parent folder starting at `~/Zero Projects`,
with another location selectable. Zero remembers the selected clone parent in the
local editor profile for future clones; cancelling the picker or opening a local
project leaves that choice unchanged. An unavailable saved folder falls back to
`~/Zero Projects`, then home if necessary. The unreleased shared-identity source uses Zero’s guarded authenticated clone and
opens the returned folder in a new window. It requires the pinned Codepet App
configuration and never falls back to the built-in broad GitHub OAuth provider.
General Git/terminal network actions do not inherit Zero’s credentials. Open local project
validates and opens an existing Zero folder without cloning, moving it or creating
the default folder. Website/tutorial instructions use these visible labels.

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
starring write, plus Metadata read; no broad Administration permission is used.
Registration and pinning do not prove installation, device authorization, token
issuance or live acceptance. The source remains unreleased and local Run stays
available without a connection. The extension registers the supported
`zero-github` provider, keeps device-flow token pairs in SecretStorage,
and uses no shipped client secret. Website OAuth uses the same client ID with
its own credential family and eight-hour reconnect policy. Browser sign-in remains
disabled without the required server credentials; registration did not provision
a client secret, private key or user tokens. The subsequent owner-approved native
flow issued its own user tokens. A selected test installation, native device sign-in, private clone and guarded
Commit & push have passed in an isolated Mac profile. The remaining live acceptance,
production activation and an authorized native release remain pending.

Focused native checks are `node --test extension/test/github-app-*.test.js`,
followed by the full extension suite. Mocked API/device-flow tests and disposable
local Git exercise lifecycle and authority guards; they do not prove real GitHub
permission consent, creation, refresh or Pages behavior. Those checks require the
registered App and disposable student-owned repositories. GitHub’s **Only select
repositories** installation form requires at least one repository; empty-account
onboarding has not been verified.


## Shared branding assets

Editable SVGs live in [design/brand](../design/brand/README.md). Website
preparation copies the light/inverse marks and generates PNG browser/Apple/share
assets with pinned Sharp. Shared design preparation synchronizes the theme-aware
editor SVG from the canonical geometry. Native packaging reads the same geometry
and creates ICNS/ICO files only in build directories; Windows embeds the icon in
the executable and passes it to Velopack. Source changes do not replace released
installer bytes. Use the existing website/design/installer checks plus actual
light/dark web inspection; physical Windows icon rendering remains separate.
