# Development

Canonical repository: `https://github.com/codepetca/zero`, integration branch `main`.
Publish through a reviewed feature PR only with user authorization. Never deploy
or change account credentials without separate explicit authorization.
There is no deployment or required external service. No keys or private environment file
are required. Keep one writer per component when delegating; inspect changes
before integrating another worker. Prefer the existing checkout for small changes; coordinate branch/worktree ownership.

## Commands

Use Node.js 22+ for developer tooling. Students use a supported JDK 17+ and VS Code; Git is needed for repository work.
Students do not need Node.js or global Maven.

```sh
npm ci
npm run check
npm test
python3 scripts/verify-examples.py
npm run package
```

Java build and finite GUI smoke commands are documented in
[the student starter](../student-template/README.md). Builds use the project
wrapper; do not require students to install Maven or Gradle globally.

Open this repository in VS Code and launch the `Zero Extension` debug
configuration (F5) to use an extension development host. The host opens
`student-template/`. Use the command `Zero: Show Sidebar` if needed. Test a
local VSIX in an isolated VS Code user-data/extensions directory before
installing it in a normal profile.

## Verification posture

Test non-trivial project resolution, Git URL parsing/root guards, simulated
upload side effects and lifecycle behavior. Do not add tests that merely repeat
styling/configuration. Configuration and ZIP consistency checks are useful
delivery checks, not proof of actual editor behavior.

Record actual interactive and operating-system checks in
[VERIFICATION.md](VERIFICATION.md). Run `git diff --check` before handoff.
Git/authentication tests must intercept transport and avoid account/config
changes. They cover the opt-in live upload engine, not actual authentication or
GitHub network transport. Simulation stays the default. Mac profile UI has been
checked; physical Windows/Linux, real uploads and student pilots are pending.

## Dependencies and future changes

Pin JavaFX, Maven wrapper/distribution and npm tooling; commit the npm lockfile.
The framework source is currently shipped inside the starter, making it easy to
inspect. A versioned shared JAR and student contribution release process are
future milestones. Keep ordinary JavaFX available instead of growing a full
engine or introducing a second language.

## Small contributions and classroom pilots

Start with one readable helper, example or useful error. Preserve ordinary Java,
explicit object updates and native JavaFX escape hatches. Put alternative examples
outside compiled `src/`; document exactly which files students should copy.
Include the checks actually run and get review before a cohort adopts a change.

For a pilot, use the packaged starter on a student machine, import the settings-only
profile first, then install the local VSIX and both Java extensions in that profile.
Check Run/Stop, standard build shortcut, compiler navigation and an example.
Repository connection needs a standalone Git root. Real-upload pilots additionally
need explicit authorization, student-owned empty GitHub repositories, local Git
identity and configured Git HTTPS credentials. Verify the remote files and separate
Pika link submission; record the OS, JDK, result and limitations in the evidence.
Do not describe intercepted transport or a successful compile as a real upload.
