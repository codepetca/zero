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
npm run check
npm test
python3 scripts/verify-examples.py
npm run package
npm run verify:kit
npm run verify:framework
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

Native development installers are built locally with `npm run package:installers`.
This rebuilds and verifies the kit, then produces a universal macOS app/DMG and
an AnyCPU Windows EXE in ignored `dist/installers/`. Platform-only builds use
`node scripts/build-installers.mjs --platform macos` or `--platform windows`
after packaging/verification. macOS requires Xcode command line tools and
`hdiutil`; Windows cross-builds use the .NET SDK and the pinned build-only
.NET Framework 4.8 reference package. Students need no .NET SDK. Run packaging
tests with `npm run test:installers`; platform harness commands are in
[INSTALLER.md](INSTALLER.md). Default builds involve no signing credentials or publication. Explicit, separately
authorized Mac signed-build commands and verification are in [INSTALLER.md](INSTALLER.md);
signed mode reuses the existing kit and does not perform notarization.

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
The optional `release/installer.json` adds **Download for Mac Silicon** on Learn more.
When that installer is published or local downloads are enabled, the landing
Download Zero action opens the platform choices at `/learn#downloads`. Mac setup
and the Windows complete-kit ZIP are the only visible download controls, with no
extra instructions or version prose. The complete ZIP, starter and VSIX remain
available on GitHub releases with their own kit version, even when Mac setup
and the published ZIP are different versions. Local-preview controls are labeled
as such; unavailable platform buttons are omitted. No unsigned Windows
EXE is offered. The current MVP supports Apple Silicon Macs and Windows.
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
when a sketch includes controls. Check that the scored quiz and practice copy the canonical
ScoreDisplay unchanged and that the caption constructor preserves existing apps.
Study checks should exercise retries, duplicate scoring, advance/completion and
restart, including a second run. Keep question data in ordinary Java objects.

Test project resolution, Git URL parsing/root guards, simulation side effects,
native authentication states, review cancellation, account/session drift and
credential isolation. Git/authentication tests use mocks and intercept transport;
no real sign-in, upload or account/configuration changes are authorized by a
local development check. Simulation stays the default. Signing in is separate
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
the starter so students can inspect and edit it. SimpleApp builds ordinary JavaFX
interfaces; SketchApp adds canvas animation. Keep explicit object updates and
ordinary controls/layouts available rather than introducing a larger engine.

Start with one readable helper, example or useful error. Put alternative examples
outside compiled `src/` and document exactly which files students copy. For shared
components, start from `examples/shared/ScoreDisplay.java`, test exact-copy reuse
in quiz, practice and study, retaining the caption enhancement and existing
no-argument constructor. Include meaningful behavior checks and a short explanation
another student can follow; seek review before cohort adoption.

Advanced contributions can introduce ordinary Java packages/interfaces when a concrete app needs them. Shared libraries and automated submission are described in [COMPONENTS.md](COMPONENTS.md). Original source uses [MIT](../LICENSE); upstream notices retain their terms.

## Maintained libraries and ZeroHub

All source is in Zero; no sibling repository is required:

```sh
python3 scripts/verify-starter-ui.py
python3 scripts/verify-health-bars.py
npm run test:postgres --prefix hub
ZERO_HUB_RELEASE_PG_MAJOR=17 npm run test:availability --prefix hub
ZERO_HUB_RELEASE_PG_MAJOR=18 npm run test:availability --prefix hub
ZERO_HUB_OPERATIONS_PG_MAJOR=17 npm run test:operations --prefix hub
ZERO_HUB_OPERATIONS_PG_MAJOR=18 npm run test:operations --prefix hub
node --test hub/checker/test/validation.test.mjs
ZERO_DOCKER_TEST=1 node --test hub/checker/test/docker.test.mjs
npm run verify:hub -- --output .verification/hub-proof
```

The library proofs check the real JAR and native consumers. The ZeroHub integration proof checks failed/corrected submissions, immutable releases and Add/Update/Revert across both study/game consumers. Run [the local service and website](../hub/README.md) for browser prepare/download/upload/listing checks. Local identity is a demo, not GitHub OAuth.

ZeroHub platform code gets independent source review. Uploaded libraries use trusted automated minimum checks without routine maintainer acceptance. Do not run submitted commands on the host; candidate Java belongs in the isolated checker. Public hosting and the outstanding checker review are separate rollout gates.

Private backup/restore and release withdrawal are operator tools, documented in
[the service guide](../hub/service/README.md#private-operator-backups). They are
not student package acceptance or an alternative to the held checker review.
