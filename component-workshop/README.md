# Component Workshop — health bar alternatives

This native JavaFX app reads a trusted local community checkout. Select plain
HealthBar or SegmentedHealthBar to preview app-owned health, try explicit updates,
and read the selected API and two examples. Both remain experimental MIT
components without a named maintainer or contributor recommendation authority.

From the sibling community checkout, prepare current trusted local source:

```sh
python3 scripts/prepare-public-release.py --local-source --zero-root ../zero
```

Then from Zero:

```sh
node scripts/prepare-component-workshop.mjs ../zero-community --local
node scripts/run-component-workshop.mjs
node scripts/run-component-workshop.mjs --check
node scripts/package-components.mjs ../zero-community --local-source
```

Preparation copies exact verified current artifacts to an immutable local Maven
repository. The finite native check exercises selection, state buttons, caption,
adjustment, reset, both public APIs, continuous/segmented fill, clamping, independent
views, constructor errors and source-bound packet export. It also verifies edited
source requires rebuilding, bad API/fill mutations fail, private files stay out,
license drift is rejected and either component's source drift invalidates receipts.

Build local source & check uses the JDK compiler with fixed Java17/JavaFX options,
annotation processing and implicit compilation disabled. It compiles every declared
component source, loads the resulting classes in an isolated loader, and checks both
alternatives. It never invokes contributor POMs or hooks. Trusted candidate Java
executes with normal local permissions; this is not a sandbox for remote submissions.

Prepare contribution creates a new local folder with schema1 ZIP and check report.
The shared digest covers every component's source, API, tests, examples, manifest,
POM and MIT notice. Source changes require fresh checks. Metadata changes require
reopening the Workshop to reload its scope. Nothing is uploaded or accepted.
Contributor/CI/AI receipts cannot appoint maintainers, recommend alternatives,
approve contributions or promote a component into core. Use an ordinary source PR
for independent review by existing canonical repository maintain/admin users.

The source POM defaults to pinned HealthBar0.1.2 for old metadata/runtime compatibility.
Current preparation passes exact0.1.3 coordinates and verified source/artifact hashes;
portable assembly writes those exact pins into its generated POM. Historical schema1
HealthBar-only metadata and packets remain supported. Core stays pinned0.1.1.
Published0.1.2 artifacts and historical0.1.0/0.1.1 source/POM bytes stay unchanged.

Public preparation without --local-source requires clean committed source. Local
working-tree proofs identify the exact declared digest and mark sourceState as
working-tree; commit URLs identify the base only. Packaging retains committed-source
guards by default and refuses artifact replacement. Explicit local packaging creates
a separate version-and-digest-named archive without publication claims.

Extract the complete portable folder and keep sibling directories together. Open
component-workshop in VSCode, or run ./mvnw compile javafx:run (Windows:
.\mvnw.cmd compile javafx:run). JDK17+ is required; no Node/Python is needed to run,
check or export the portable app. First-time Maven/JavaFX dependency downloads need
network access. Preserve both MIT LICENSE files and Maven wrapper notices.

Verification is finite synthetic native JavaFX on macOS. Physical input,
DirectoryChooser interaction, Windows/Linux and novice classroom trials remain
unverified. No external AI provider is configured. See VERIFICATION.md.
