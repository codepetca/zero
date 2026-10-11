# Verification

## Lesson 12 full game — source PR, 2026-10-10

Baseline published f8f7829; isolated codex/lesson-12-game. All five stages remain
inside Lesson12: media-demo, scrolling-game, platform-game, level-game, full-game.
Core framework, shared ScoreDisplay, dependencies and published metadata unchanged.

Affected acceptance checks pass: configuration/source-link check; website26tests,
typecheck and production build; in-memory ZIP2tests including new example Java and
README bytes and extracted standalone compilation. No immutable release was rebuilt.
Native macOS JavaFX21.0.12 checks pass for media-demo(3.96s), scrolling-game(2.42s),
platform-game(2.68s), level-game(2.29s), full-game(2.40s). They cover cached media,
camera clamping including small worlds, fixed HUD and drawing transform restoration,
solid floor/wall/head response, frame cap and jump edges, once-only collection,
level score/retry rules, danger, locked exits, win/loss freezes and repeated restart.
The final game also completes both levels twice using synthetic held keys and
1/120second updates without teleporting the player. Other state checks intentionally
place objects to isolate transitions. No physical keyboard/novice play claim.

Coordinator caught and worker corrected two harness defects (early scrolling
contact assertion and JavaFX Platform import shadowing) plus a real physics bug:
floating residual steps cleared grounded on a floor. Integer bounded step counts
fix that bug in all three gravity stages; final native checks above pass.
An earlier platform at80px was reduced to70px to fit the actual discrete jump.

Local production browser checks pass:11→12 navigation, five collapsed stages,
stage→example links, complete8Java/2resource copy lists, current Player source,
actual PNG/WAV downloads with byte parity, no horizontal overflow or error logs.
The example guide links now open runnable pages instead of raw README text.
Ignored evidence: .verification/lesson12-game/lesson12.jpg and game-playing.png,
game-won.png. Game images are native JavaFX scene snapshots from a disposable
renderer running the same complete game check; they are not OS screenshots.
Physical Windows/Linux, audible output, physical editor/keyboard/setup flow and
novice classroom trials remain unverified. Source PR21 is owner-authorized;
no new immutable release or direct deployment is included.
Independent standard-risk lesson12_review/turn1 GPT-6.1-Sol/high accepted
f8f78290e3fd6cc3cae9ddfde9d79534778b9c87..8c9896d53bc3ea2674b640c907a3184555383142:
all46files covered, no blocking findings. Independent focused learning7tests and
full-diff whitespace check pass. Coordinator UTC observations indicate~150seconds (approximate); effective model
and attributable tokens unknown. Ledger:1launch/1initialwave/0fixbatches; no redundant
integration wave. Subsequent receipt/pilot wording changes are coordinator-checked;
reviewed implementation is unchanged. Native Restart only sees canvas-held state:
focusing its button clears that state, so OS repeat after refocus needs a physical
pilot. Synthetic jump-reset coverage does not establish that physical guarantee.

Original-head [PR21](https://github.com/codepetca/zero/pull/21) Actions
[38101600157](https://github.com/codepetca/zero/actions/runs/38101600157) passed:
full extension/kit tests, release guards, all finite Linux JavaFX examples under
Xvfb/virtual audio, website tests/types/build. Main PR20 changed only policy and
documentation; integration preserves the exact reviewed game/site/runtime source.

## Current published delivery — 2026-10-10

Zero0.5.3 and Community0.1.3 are published. The complete source/review/CI/PR/release
index is [EVIDENCE.md](EVIDENCE.md); [release/kit.json](../release/kit.json) and
[release/community.json](../release/community.json) preserve actual asset metadata.
Historical local-only status below the old handoff is superseded by this delivery.

144extension/kit tests,24site tests,types/build, configuration/link checks and
finite native examples passed for publication. Linux CI used Xvfb plus virtual
PulseAudio/ALSA for real AudioClip playback/finish state; this did not test speakers.
Community had two reproducible builds,6JavaFX checks and4actual consumer apps.

All3Zero and9Community public downloads matched exact sealed/source-bound bytes.
The real live-page Download Zero click matched the canonical ZIP. New-cache,
empty-settings public Maven gateway consumption passed native segmented-health-bar
checks. Historical0.5.2/0.1.2 artifacts remained byte-identical.

Independent reviews covered the source release delta, two CI/media corrections,
public catalog/provenance/legacy compatibility and final two-file kit metadata.
The evidence index records exact revisions; AI reviews are not GitHub human approvals.

## Limits

Synthetic macOS actions and virtual Linux CI do not establish physical editor
setup/input, Windows/Linux classroom machines, native chooser interaction,
audible device output, school restrictions or novice usability. No live AI
provider, public student acceptance or automatic Community approval is claimed.

## AI workflow audit/remediation

Audit:43Zero release tests plus48Community admission/acceptance tests passed.
Reproductions exposed CI-policy identity and two AI interface boundary gaps.
Remediation:39admission and25acceptance/release tests pass, including no-op
workflow, policy changes/modes, main/head drift, exact outbound-byte boundary and
invalid schema cases. Zero43release tests,24website tests, types/build and
configuration/link checks pass. Two initial independent scopes and the targeted correction review are complete.
Both accepted P2 authority-snapshot/publisher-doc findings are resolved; no new
blockers. Five reviewer race checks passed in2.173seconds. Runtime source matches
the reviewed Community6be28609; Zero1d37a702 is documentation only. Final receipt
edits are coordinator-checked. GitHub main protection was independently read back
after review, then removed at the owner's explicit request. Source changes and
CODEOWNERS are in owner-approved PR20/PR5; recover actual merge status from GitHub.
No kit/library/extension version changes or new immutable releases are included.

## Historical verification

[Earlier checks and phase receipts](history/verification-through-2026-10-10.md)
retain prior trial evidence and limits. They describe their recorded revisions,
not current published state or new authorization. Full logs, screenshots and
archives remain ignored under `.verification/`; the tracked index is sufficient
for a fresh agent to locate durable public evidence.

## Guided setup — local 0.5.4

`8032789`: full npm test passed178tests in127.901seconds. Launcher12tests use
macOS Bash3.2 fake tools/disposable kits (8.594seconds); Windows script execution
was not performed. Release publisher/review43tests and kit3tests pass.
`61025bf`: 46 affected setup/editor/onboarding/workflow tests passed in0.171seconds;
unchanged full-suite coverage reused. Both accepted independent-review P2 findings
are resolved. A reviewer independently confirmed task-env drift blocks Run handoff.

Final configuration/syntax/command/documentation-link and whitespace checks pass.
Regenerated complete ZIP/starter/VSIX pass exact source/license/metadata/permissions
checks and a standalone extracted Maven compile. The complete kit includes the
pre-existing merged Lesson12 game stages. The website's published0.5.3 download
was not changed. Artifact sizes/hashes and logs are in the ignored guided-setup
receipt and local dist/release.json. No further runtime change after61025bf;
final README wording/receipt edits are coordinator-checked.

Read-only checks use fixed bounded version probes. Tests cover missing/old/mismatched
JDKs, invalid JAVA_HOME, quoted paths, optional Git, profile-specific extensions,
cancellation/blocked repair, missing files and POSIX wrapper permissions. Relevant
terminal environment overrides (including null/interpolation/Windows mixed case)
leave readiness unverified rather than changing settings or assuming the task JDK.

No real installer, host extension/profile/account mutation or system-policy change
was executed. Native Windows PowerShell/cmd, physical Linux, fresh-machine macOS
installs, actual permission prompts, school proxies/policies, native picker use and
novice setup remain unverified. Version checks do not establish a working app window;
Run first app and visual confirmation remain explicit student steps. No publication.

## Setup reliability follow-up

At e2fad4b,27launcher tests passed in20.367seconds; at corrected a6078be,
34passed in28.067seconds. Fake-machine tests cover old/minimum/new/unknown VS Code,
known app fallback, path selection, invalid metadata, managed install/upgrade,
cancellation, current package/configuration guidance and selected JAVA_HOME.
Correction cases model Homebrew's named-outdated status1 and explicit auto-update
cask filtering; unnamed inventory filters exact names. Real inventory failure,
unrelated/prefix names, failed installation/update with recheck, Git formula
handling and read-only checks are covered. No real package-manager mutation.

4kit tests passed in4.019seconds, including metadata/engine policy agreement,
unsupported range rejection and standalone extracted Maven compile. Configuration,
syntax, documentation links and whitespace pass. Regenerated ZIP verification
passes exact bytes, licenses, canonical sources, executable permissions and
standalone build. Metadata/extension policy is not duplicated in script constants.
Unchanged editor/framework source retains prior checks; the full suite was not
repeated for this shell-only correction. Independent initial and targeted source
reviews are accepted; final receipt-only changes leave runtime unchanged.

macOS Bash3.2 fake-tool execution is verified. PowerShell/native Windows, actual
Homebrew/winget installers, clean-machine profile/editor interaction, school
network/policies and novice usability remain unverified. Known-location discovery
is bounded, not an exhaustive machine inventory. No native EXE/app/DMG is claimed.


## Native setup wrappers — local development builds

Native feature base d0311ea1827769110adbe86b5a66db83b85ed113, implementation
d9c79ba8d8b0939be1df2c3256853423d7512db2, accepted corrected runtime
b3551bec3b0cb856b386876d0aebf9553d5035f0. Existing kit/editor/framework source
coverage remains valid; native wrappers do not change Java APIs or sharing.

- Mac harness:56 assertions passed, including complete/executable copy, existing
  and raced destination preservation, detached pipe timeout, copied-file failure,
  real delegate window/quit guards and paused fake check/launch. ARM64 and x86_64
  compile with warnings treated as errors. AppKit preview uses fake check results.
- Windows harness:52 checks passed under Mono, including ZIP validation before
  writing, fresh copy/cancellation, paused work close gate, literal argv quoting,
  nonzero/timeout/cancel/incomplete-output capture, and real kit extraction.
  Final net48 AnyCPU publish emits EXE only, with no extra runtime DLLs.
- Packaging:3 tests pass; configuration/syntax/command/document links pass.
  Rebuilt kit verifies source/licenses/metadata/modes and extracted Maven compile.
  Final installer verifier measures DMG/EXE hashes, Windows PE/CLR header and
  exact embedded ZIP; mounts DMG read-only, compares every payload byte/mode,
  checks executable launcher and both architectures, then detaches.
- Local complete kit236725bytes, SHA256
  `1dc0d486a9bd07f5dd8ab75896e599771435025e23b8ce792cd26d3b63d90bed`.
  DMG389837bytes, SHA256
  `2df1cf3fd2fd5f5ddb2a35ee643590656cf4b8d53804230caf988700814de14d`.
  EXE270336bytes, SHA256
  `49fc51d838da5b2e1a0d12c9f33b6bd39ec3ff6116110e6fdf9a1e2017e24ac4`.
  Measured source-clean receipt at dist/installers/build-all.json binds b3551be.

Two complete initial independent reviews plus one correction pass accepted the
runtime. Normal close now waits for asynchronous cleanup; detached/incomplete
output cannot imply readiness; Mac rechecks its copied kit. Forced termination
may leave an owned staging folder but cannot authorize overwriting an existing
project. Physical Windows UI, ACL creation, Explorer/native PowerShell/policy,
physical Intel execution, clean-machine tool installs, security/signing prompts,
restricted networks and novice usability remain unverified. macOS checks use
disposable files/fake commands; the preview is not a real setup completion.
No host installations, profiles/accounts/credentials, policy changes or remote
writes occurred. Artifacts remain unsigned development builds and unpublished.


## Mac-first real setup and editor check — 2026-10-10

Owner explicitly deferred Windows testing. Base9917502b5c349863a3ad12b1bdabdf3667f536a2;
reviewed Mac runtime4b7058c46a0c2f633329c8f5222a25f5376e7623.
On Apple Silicon macOS26.6.2, native Check laptop exposed inherited blocked child
signals: Bash could survive TERM and normal probe timer cleanup waited20seconds.
The correction resets only spawned child signal masks/dispositions, retaining
owned process groups and bounded output/timeout cleanup. Before/after self-TERM
proof and timer-trap regression pass;62 native harness assertions pass.

Real AppKit app startup, Check laptop and native parent/name picker succeeded.
The existing VS Code1.141.0/JDK17.0.14 were detected; missing/old Zero profile
support remained visible instead of implying readiness. Native copy produced126
files with exact ZIP bytes/modes in a disposable fresh folder. Continue setup
started its copied Setup.command/setup.sh. The computer-control tool denied
Terminal GUI access; only those test-owned launcher processes were stopped.
The copied guided menu subsequently ran in an isolated PTY and exited with0;
no install/repair action was selected. A read-only check using an isolated Code
CLI shim reported ready (real Code plus disposable profile/extensions).

Real marketplace installation in separate test directories installed Red Hat
Java1.56.0, debugger0.59.0 and the packaged local Zero0.5.4 VSIX. Existing user
profiles/tools/accounts were preserved. The VS Code test host passed6 flow
assertions: packaged extension activation/fixture settings, Run App with a visible
Hello, world! JavaFX stage, Stop, actual editor autosave, default build command
with changed Hello, Mac! stage, and second Stop. A disposable Main.ready stage
probe recorded isShowing/label; it was removed and the original Main restored.
This is actual editor/task/JavaFX execution, not a screenshot or manual button
click trial. The first test attempt stopped at the trust guard; the final test
used an ephemeral trusted-fixture flag. Quiet-profile settings were deserialized
into disposable test data; actual profile import and trust prompts remain
untested. VS Code UI automation could not select the separate instance safely.

Rebuilt only the Mac artifact from clean reviewed4b7058c; macOS-only verification
checks checksum, both ARM64/x86_64 architectures and every read-only mounted
payload byte/mode. Current DMG645322bytes, SHA256
`54bd45768aeeaf8fbbb3a884cd99fa4b97390d5ad966e71b686dc8dc65ca10ed`.
Current receipt: dist/installers/build-macos.json. The prior build-all.json was
archived to .verification/native-installer/build-all-b3551be.json because its
Mac hash is superseded; its Windows record is historical. Kit ZIP/VSIX unchanged.
Logs, real editor receipt, proof binaries and test fixtures: .verification/mac-first-run
and .verification/native-installer/macos-signals.

One complete independent GPT-6.1-Sol/high review accepted the two-file delta and
immediate process/controller/probe callers, with no actionable findings. No extra
integration review added coverage after that clean pass. Whitespace checks pass.
Intel execution, fresh-machine installs, native Terminal/profile/trust interactions,
Gatekeeper/notarization, restricted networks and novice usability remain pending.
Windows testing stays deferred. No publication or existing tool/profile/account/
security-policy change; the Mac package is unsigned local development only.
