# Automatic updates for Zero on macOS

Research completed 2026-10-14 against local source
`27a0ca10055bd432d404fababc1e7a6128d8c260` and published Zero 0.5.14.
Status: proposed implementation, not an implemented or released updater.
The owner requested research and planning only.

## Recommendation and student experience

Embed pinned **Sparkle 2.10.0** in Zero.app. It is the current stable release
checked during this research and has the same macOS 12 minimum as Zero's native
launcher. Recheck security fixes before implementation and pin the selected
distribution's exact URL and SHA-256. [Sparkle releases](https://github.com/sparkle-project/Sparkle/releases)

Keep the initial drag-to-Applications installation. Users of 0.5.14 need one
manual replacement with the first updater-enabled build; their existing app has
no updater code. Subsequent updates should work like this:

1. The student opens Zero. Setup/readiness work finishes and VS Code opens promptly.
2. Zero checks for updates in the background when due, about once a day when the
   student launches Zero. Downloads and installation are enabled by default;
   a student can turn them off.
3. Once a verified update is ready and all Zero setup helpers have finished,
   Zero quits and Sparkle replaces Zero.app. The student's running VS Code,
   Java app, project and unsaved editor buffers keep running.
4. On the next ordinary Zero launch, the new app prepares only its owned kit
   support files, repairs readiness when necessary, and resumes the saved editor
   session. The existing centered preparation window/progress bar covers this work.

Use Sparkle's standard interface for manual checks, progress, errors and any
necessary installation authorization. Background updates can install on quit;
managed or non-writable installations can require an administrator's approval.
Do not promise silent updating on every school Mac.
[Sparkle update UI and authorization](https://sparkle-project.org/documentation/custom-user-interfaces/)

This design checks while Zero is launched. Opening VS Code directly, or keeping
it open for days without opening Zero, does not run an updater. A permanent
Zero login/background service is outside this first implementation.

## Launcher lifecycle: first implementation gate

`SetupWindow.swift` currently terminates Zero immediately after handing off to
VS Code, and terminates when its last window closes. A normal long-lived-app
Sparkle integration would therefore have too little time to finish.

Proposed design, to prove with two disposable signed builds before committing
to production packaging:

- A strongly retained updater coordinator belongs to `SetupApplication` on the
  main thread. Initialize it only in the GUI app, after successful setup/handoff.
  Explicit update-only/settings sessions initialize it without ordinary setup.
  The early `main.swift --runtime` branch remains outside updater initialization.
- Hide the preparation window after handoff and allow a short background
  lifecycle. Initial target: a 120-second unattended-work budget after handoff,
  with exceptions for visible update UI or committed installation and no added
  wait before the editor opens. Terminate promptly
  if automatic checks are disabled, no check is due, no update exists, or a
  background check fails. Slow/interrupted downloads retry on a later launch;
  partial-download resumption is not a promised feature.
- Use Sparkle's scheduling and persisted preferences, with a 24-hour default.
  If an explicit launch-time check is necessary, invoke it immediately after
  starting the updater and only when automatic checks are enabled and due.
  Never overwrite the student's preference at every launch.
  [Updater lifecycle and settings API](https://sparkle-project.org/documentation/api-reference/Classes/SPUUpdater.html)
- If checks are enabled but automatic downloads are disabled, a found update
  may present UI. Transition to the foreground interaction lifecycle instead of
  letting the unattended timer close the offer.
- Track check completion, installation-on-quit readiness, actual helper activity
  and visible update UI separately. `sessionInProgress` alone is insufficient:
  an installer can be running after an update session finishes. A deadline must
  not dismiss an authorization dialog or interrupt an already committed install.
- Once an update is scheduled for installation on quit and no setup subprocess
  is active, terminate normally. Suppress automatic relaunch for this background
  handoff so the updater does not reopen another editor window. Use the documented
  update-cycle/install-on-quit/relaunch delegates; do not infer readiness merely
  from a completed download.
  [Updater delegate callbacks](https://sparkle-project.org/documentation/api-reference/Protocols/SPUUpdaterDelegate.html)
- Protect helpers with application termination gating and a serialized transition
  into installation. Do not rely on the relaunch-postponement callback: Sparkle
  may omit it when no relaunch is planned. Once termination/installation commits,
  prevent new setup helper launches until the replacement process finishes.
- Reopening Zero while that short background process exists must launch/resume
  the editor again, without starting a duplicate check or allowing app replacement
  during a new setup helper. Replace the current unconditional window-reopen
  behavior with explicit launching, handed-off and foreground-update states.
- Manual **Check for Updates…** stays available in Zero's app menu. Since that
  menu is transient, add a macOS **Zero: Check for Updates** Command Palette
  command in the extension that requests a foreground native update-only session.
  Provide an **Update Settings…** entry there for the two automatic-update
  preferences. These explicit sessions remain open while the student interacts;
  they must not start ordinary kit setup or force-open the starter.
  Suppress automatic relaunch for manual update-only sessions too. Settings close
  when their window closes; manual no-update/error results remain until dismissed,
  then terminate when there is no other active work.
- Define a narrowly parsed native request for those commands that reaches an
  already-running Zero process as well as a new launch. Ordinary launch arguments
  alone are insufficient for that case. Do not accept arbitrary feed URLs,
  executable paths or installation targets from the extension/request transport.

The 120-second target, UI focus/Dock behavior, safe termination during a download,
and repeated-open behavior are design choices requiring the lifecycle spike.
If Sparkle cannot satisfy them without an unsafe workaround, revise that lifecycle
before proceeding; do not introduce an ad hoc detached updater script.

## Preserve projects, settings and editor state

App replacement affects Zero.app only. Existing data remains in `~/Zero` and
`~/Library/Application Support/Zero`; use the existing `KitUpdatePlan` ownership,
backup and anchored-write checks for subsequent support-file preparation.
Never copy a complete fresh kit over the student's folder.

Fix the existing upgrade-session issue in `SetupCore.swift:704–722` and `801`:
currently only an exact kit match sets `restoringSession=true`. A recognized
older installation goes through update/configure and then `--native-open`, which
opens the starter in a new window. Recognized upgrades should also choose
`--native-resume`; an actual first installation should still open the starter.
Review the fallback `Open Zero.command` behavior explicitly rather than changing
it incidentally.

`MacRuntime.seedSettings()` already preserves an existing `settings.json`.
Retain that boundary and all editor data, extensions, sign-in state and student
repositories. Test Java pin changes separately: existing settings can reference
an older digest-addressed JDK directory. Do not delete it or rewrite student
settings as a side effect of updating the launcher. Java/VS Code vendor update
policies and student library dependency pins are separate work.

Installing a newer VSIX does not prove it is active in an already-running editor
window. Verify the extension's installed and active versions independently. Never
force-reload an editor containing unsaved work; use VS Code's supported reload
guidance if necessary, with the student choosing when to apply it. Distinguish
that activation step from the automatic replacement of Zero.app.

## Trust, packaging and release contract

| Area | Proposed contract |
| --- | --- |
| Native identity | Keep production `ca.codepet.zero`, Developer ID team and macOS 12 minimum. Development identity remains separate and has production updating disabled. |
| Version ordering | Replace constant `CFBundleVersion=1` with an authored, strictly increasing native build number, initially `2`, then `3`, etc. Preserve the human kit/app version as `CFBundleShortVersionString`. Every distributed build number is immutable and never reused; validate ordering during preparation. |
| Dependency | Pin Sparkle's binary distribution/hash and license notices. Copy framework symlinks and executable modes correctly; add Swift framework search/link and executable-relative Frameworks runpath. |
| Signing | Re-sign each bundled helper/XPC component, then framework, then app, using explicit inside-out signing and timestamps. Retain the distribution's full reviewed framework for the first version. Do not enable sandbox-only services or relax Zero's no-entitlements rule without a demonstrated need. |
| Update trust | HTTPS, existing Developer ID/notarization, and an Ed25519 signature over the exact final DMG. Embed only the public Ed key. Provision/export/securely back up the private key during separately authorized implementation; never store it in Git, app, feed, logs or website. |
| Feed | Proposed stable URL: `https://zero.codepet.ca/updates/macos/appcast.xml`. This URL is not created or deployed by this plan. It points to exact immutable GitHub `setup-v…` DMGs, with native build, display version, minimum OS, byte length and Ed signature. |
| Feed validation | Enable pre-extraction archive verification and signed feeds. Proposed strict setting: signed-feed failures never expire (`SUSignedFeedFailureExpirationInterval=0`). A lost key requires a deliberate recovery/manual installer; document key rotation and backup before rollout. |
| Artifact scope | Reuse the signed/notarized/stapled website DMG as the full update enclosure. No delta files, update ZIP or extra native release asset in the first version. Confirm the pinned appcast tool's no-delta option during implementation. |
| Release metadata | Add a separate strict updater manifest rather than casually adding unknown fields to schema-1 `release/installer.json`. Seal build number, dependency hash, key identity, exact enclosure, signed feed snapshot/hash and source provenance in candidate receipts. |

Under today's packaging contract, each distributed successor must also advance
the kit/extension version: DMG names and `setup-v…` tags use that version, and
published kits are immutable. Advance native build number and kit version
together initially. A higher build number alone cannot create a distinct release;
independent native-only releases would require an additional versioning design.

Sparkle documents non-Xcode embedding, archive signing and incremental bundle
versions. Its signing guide requires explicit nested component signing for this
kind of custom build pipeline.
[Integration](https://sparkle-project.org/documentation/),
[nested signing](https://sparkle-project.org/documentation/sandboxing/#code-signing)

Automatic-check/download defaults, pre-extraction verification and signed-feed
behavior are documented configuration options. Keep system profiling and release
notes JavaScript disabled; user choices override defaults.
[Sparkle configuration](https://sparkle-project.org/documentation/customization/)

Extend `build-installers.mjs`, `installer-signing.mjs`, `verify-installers.mjs`,
`mac-release.mjs` and protected-source lists in `website/lib/local-installer.mjs`.
Verify every nested Mach-O's expected architecture/signature, library linkage,
component-specific entitlement allowlist and the pinned framework's resource
layout. Signed framework files cannot retain their upstream file hashes after
re-signing: distinguish verified distribution bytes from sealed final signed
component evidence. Allow only expected internal framework symlinks; the kit's
no-symlink policy stays intact. There is currently no general Contents whitelist,
so introduce a scoped app/framework layout contract explicitly.

Retain the universal artifact's architecture integrity without expanding MVP
support beyond Apple Silicon. Intel/macOS 12 behavior needs evidence before any
new compatibility claim. Windows remains on its current complete-kit ZIP path.

## Publication and recovery

Publish only through the existing reviewed, owner-authorized release process:

1. Build and verify the exact signed/notarized/stapled DMG. Sign its final bytes
   with the update key; any later DMG mutation invalidates that update signature.
2. Seal a signed versioned appcast snapshot and companion metadata. Publish the
   immutable GitHub DMG, then anonymously verify public URL, length, SHA-256 and
   update signature against the sealed candidate.
3. Promote the signed feed through the website deployment only after the DMG
   checks succeed. Serve feed bytes without XML rewriting/signature-breaking
   transforms and with deliberate cache headers. Retain immutable signed feed
   snapshots separately from the mutable current feed.
4. Verify the live feed bytes/signature and run the actual signed upgrade chain.
   Feed publication must not silently promote an unpublished kit or Windows EXE.

Use a separate signed test feed for the initial A → B acceptance test, isolated
from developer installations and production preferences. Offer the first enabled
build as the ordinary manual installer; only advertise automatic updates after
that upgrade chain passes. Subsequent wider rollout can use Sparkle's phased
distribution feature, after a small owner smoke test.
[Feed publication and phased rollouts](https://sparkle-project.org/documentation/publishing/)

If a release is faulty, remove it from the current feed to stop new offers;
already downloaded/staged copies are not guaranteed recalled. Never rewrite an
old release asset. Publish a corrected build with a higher build number, even
when it restores earlier code. A signed manual DMG remains the recovery path.
Existing kit backups help recover support-file migration; do not claim that
rolling back the app automatically reverses completed kit changes.

## Implementation phases and acceptance

1. **Prove the launcher lifecycle.** Pin dependency; disposable signed A/B builds;
   test normal open, automatic check/download/install-on-quit, no forced editor
   relaunch, permissions and the time limit. Exit: no editor delay, unsafe
   replacement, lingering permanent process or runtime-helper updater startup.
2. **Implement lifecycle and session preservation.** Add coordinator/manual
   commands/preferences; correct recognized-upgrade resume; isolate development
   and helper modes. Test state transitions and owned-file migration failures.
3. **Complete packaging and release tooling.** Add nested signing/verifiers,
   monotonic build metadata, strict updater manifest, source guards, sealed feed
   generation and controlled promotion. Provision update key with backup.
4. **Verify an upgrade chain.** Run relevant native/installer/release/website
   tests and signed artifact checks. Obtain separate independent security and
   compatibility reviews under `docs/AI-WORKFLOW.md` before release.
5. **Roll out.** With implementation/release authorization, release the first
   enabled DMG, complete owner smoke testing with the next higher build, then
   promote the production feed and document recovery.

Required behavioral evidence includes:

- Fresh installation versus recognized kit upgrade; last-project restoration;
  byte-identical student files/settings before and after; editor open with unsaved
  work; Java app running; changed runtime pins.
- No update, offline/error/slow transport, interrupted download, malformed or
  unsigned feed, bad archive signature, modified archive, wrong identity, older
  build, ineligible test channel, disabled automatic preferences.
- Multiple/repeated app launches, active setup helper, setup/update cancellation,
  authorization UI, non-writable app, launching from the read-only DMG, translocation,
  recovery from app replacement or kit migration failure, and dependency linkage.
- A genuine Developer ID signed/notarized A → B update on the supported Mac;
  disposable fixtures must not modify the owner's installed Zero or student data.

Research checked source and current primary documentation; it did not build or
execute Sparkle. The lifecycle target and all updater integration behaviors above
remain untested. No app code, signing keys, credentials, public feed, releases,
production metadata or account settings were changed.
