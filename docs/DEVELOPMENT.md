# Development

Canonical repository: `https://github.com/codepetca/zero`, integration branch `main`.
Publish through a reviewed feature PR only with user authorization. Never deploy,
push, publish or change account credentials without explicit authorization.
There is no required external service or private environment file for local app
work. Keep one writer per component and inspect changes before integration.

## Commands

Use Node.js 22+ for developer tooling. Students use a supported JDK 17+ and
VS Code; Git 2.31+ is needed for authenticated uploads. Students do not need Node.js or
global Maven.

```sh
npm ci
npm run check
npm test
python3 scripts/verify-examples.py
npm run package
```

Java build and finite GUI checks are documented in
[the student starter](../student-template/README.md). Builds use the pinned
project wrapper; do not require students to install Maven or Gradle globally.
Packaging creates local artifacts in `dist/` and does not publish them.

Open this repository in VS Code and launch the `Zero Extension` debug
configuration (F5) to use an extension development host. The host opens
`student-template/`. Use **Zero: Show Sidebar** if needed. Test a local VSIX in
an isolated VS Code user-data/extensions directory before normal installation.

## Verification posture

Check the two startup paths, useful lifecycle errors, JavaFX event/state behavior,
explicit object updates, drawing/input and shutdown. Preserve text control input
when a sketch includes controls. Check that quiz and practice copy the canonical
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
editor behavior or a real upload. Physical Windows/Linux and novice pilots remain
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

Advanced contributions may introduce Java packages, interfaces or JavaFX properties
when a concrete app needs them. A separate local versioned JAR/Workshop/admission prototype is documented in
[COMPONENTS.md](COMPONENTS.md); public distribution remains future work. A public license for original Zero code remains
unresolved; upstream wrapper licenses/notices do not license all Zero source.

## Local component lifecycle

The sibling `../zero-community` checkout has its own source, Maven library,
release-cycle proof and admission scripts. Use the actual local checkout path
with the commands below; no remote repository is assumed.

```sh
python3 ../zero-community/scripts/verify-release-cycle.py --zero-root "$PWD"
node scripts/prepare-component-workshop.mjs ../zero-community
node scripts/verify-components.mjs
node scripts/run-component-workshop.mjs
npm run package:components
```

`verify-components.mjs` checks add/update/revert with the actual extension engine
and real Maven/JavaFX in a disposable project whose path includes spaces. It
requires the release proof's cache for third-party downloads; tested community
coordinates start absent. Generated evidence stays in `.verification/`.
Workshop's `-Dzero.workshopCheck=true` option runs a finite native-window harness.
The portable component ZIP includes local artifacts/catalog, source and Workshop;
extract the whole folder and open its `component-workshop/` subfolder. Students
use its bundled Maven wrapper, not the maintainer Node/Python tooling.

Community catalog selection is explicit and local in Zero's view title (…) menu.
The extension edits only managed POM blocks through the native undoable editor,
refuses unsaved/drifted documents and preserves Java source. Add pins a version;
Update/Revert confirm and run the app. Try uses trusted packaged example source
and a separate temporary Maven cache, cleaned when its owned task ends. Maven
remains the resolver; normal project runs use ordinary Maven settings/cache.

Candidate compilation runs trusted local Java in the Workshop process with
normal permissions; it is not an untrusted-submission sandbox. Admission validates
packets without executing code. CI and advisory AI interfaces are prepared locally;
no hosted service, live provider, public licensing or authenticated acceptance
authority has been configured. See the community contribution/AI docs.
