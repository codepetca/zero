# Verification

## Calm Windows setup — local 0.5.6, 2026-10-11

Final runtime source `889e76690b2cc10835d16b12c0b4c8fa1bd311c3` is independently
reviewed: two complete initial scopes and two targeted corrections, no remaining
findings. One-line fixed-window controller and guided profile flow preserve actual
checks, explicit extension approval and existing tool choices. Read-only child
environment refresh fixes Java installation retries and preserves custom JDK order.

247npm tests,8installer tests,134coordinator net48/Mono assertions,28portable PS7
mocked checks, configuration/links, ZIP parity and extracted Maven compile pass.
Clean AnyCPU EXE and exact embedded ZIP/hash verify; final Downloads copy matches.
Signed Mac0.5.5 unchanged. Reused unaffected regression results after native-only
corrections. Artifact hashes and review receipts are in [EVIDENCE.md](EVIDENCE.md).

This cross-build/fake-backend verification does not test physical WinForms,
Windows registry, PowerShell5.1/policy, vendor installations, SmartScreen or novice
usability. Physical Windows remains deferred; candidate unsigned and unpublished.
No host tool/profile/account changes, signing, publication, push or merge.

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
`release/community.json` (retired during consolidation) preserve actual asset metadata.
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


## Mac Developer ID signed candidate — 2026-10-11

Owner authorized signing/notarization after certificate issuance. Local clean source
1cc84617c401f162f6dce0b85081fcfc87c8d648 produced
`dist/installers/Zero-Setup-0.5.4-macos.dmg` (682382 bytes, SHA256
`c9644040203edde4eed4f303b14a4320c65d4fb2f99be352887352aff6fb9631`).
Separate `build-macos-signed.json` records actual Developer ID Application signer
ACE8EE40F3615C5062CBBD5F085E299E049BAE08/team88FT6QZJP8, both universal
architecture signatures and secure app/DMG timestamps. App has hardened runtime,
no entitlements, production bundle ID and no unsigned labels. Original unsigned
DMG/receipt and exact236725-byte kit ZIP are preserved. No publication occurred.

Passed:8 focused packaging/signature tests;67 native harness assertions; Intel
Swift typecheck; JS syntax/configuration/diff checks; old unsigned-artifact verifier;
real signed build and signed verifier (strict Apple Developer ID chain, extracted
leaf SHA1/team, both architectures, timestamps/runtime, all126kit files/permissions).
Signed AppKit UI opened and real read-only Check laptop completed, correctly
reporting available tools and old/missing Zero support. No repairs or profile/tool
installation were attempted. Previous run/copy/editor evidence is reused only for
unchanged behavior; full signed clean-machine setup has not been exercised.

GPT-6.1-Sol/high implementation worker; independent GPT-6.1-Sol/high review of
4d4f872..18b6527 plus18b6527..6711290 and6711290..1cc8461: complete, no
unresolved findings. Reviewer caught literal requirement missing '='; actual first
build caught optional certificate-prefix argument syntax after successfully signing
the app. Both corrected and rechecked against the installed codesign manual;
second actual build passes. Ledger:3review launches,1initial/2targeted waves,
2fix batches, unchanged initial coverage reused, no added integration wave.
Requested configuration known; effective model/tokens/attributable elapsed unknown.
Weekly99% remaining at start is account-wide allowance, not task cost.

Notarization remains pending human authentication: no profile named
“Zero Notarization” exists in login Keychain. A private no-secret `.command`
launcher opens Apple's secure notarytool password prompt; Apple Account sign-in
page is retained for human credential creation. No password entered/read by Codex,
no Keychain access relaxation, API key creation, Apple submission, staple or
Gatekeeper acceptance is claimed. Finish authentication, submit exact DMG, wait
for Accepted, staple/validate and remeasure before changing notarized:false.
Physical Intel execution, fresh-machine installs/security prompts, profile import/
trust, restricted networks and novice use remain unverified; Windows explicitly held.
Primary funding branch and Community preserved. Separate requested business-account
conversation is projectless; no membership or certificate change from that task.


## Apple notarization completed — 2026-10-11

User personally created/entered the app-specific password; the local login-Keychain
profile “Zero Notarization” authenticated with Apple. Codex did not read its value.
Apple accepted submission `4e9cb092-c188-4066-add4-726928ee0d16` with no issues.
Downloaded Apple log binds submitted SHA256
`c9644040203edde4eed4f303b14a4320c65d4fb2f99be352887352aff6fb9631`
to that job. No repeat submission or new certificate was needed.

`xcrun stapler staple` and `stapler validate` succeeded. Gatekeeper DMG assessment
reported accepted/source=Notarized Developer ID. The signed artifact verifier
passed after stapling: actual app/DMG signatures, both architectures, exact kit
bytes/modes, ticket validation, DMG and mounted-app Gatekeeper assessment.
`build-macos-signed.json` now records notarized:true, source1cc8461, submitted
hash/size, submission ID/status/staple and Gatekeeper outcomes. Final684093-byte
DMG SHA256: `f211ae3963e9ff6bab20413e2a53601ada4d7eb215741d9e496dd1b656424c60`.
Identical copy verified in `/Users/stew/Downloads/Zero-Setup-0.5.4-macos.dmg`.
Ignored Apple submission/log/completion receipts and pre-staple DMG are retained
under `.verification/mac-signing/`. No runtime source changed; completed independent
review coverage reused. This phase handled directly by coordinator.

No push, PR, merge, public release/deployment, account conversion, Keychain policy
change, new certificate or Windows testing. Existing signed Mac UI check evidence
applies; a fresh Mac's downloaded/quarantine/install/profile/permission flow and
physical Intel remain untested. Gatekeeper CLI acceptance on this owner Mac does
not prove those interactive flows. Previous unsigned-phase limits are historical.

## Signed Mac installer local smoke test — 2026-10-11

Tested the final notarized 0.5.4 DMG copied to Downloads, on this existing ARM64
Mac running macOS 26.6.2. Its SHA256 remained
`f211ae3963e9ff6bab20413e2a53601ada4d7eb215741d9e496dd1b656424c60`.
Finder mounted the DMG and launched its actual signed app. The native laptop check
found VS Code 1.141.0, Java/javac 21.0.1 and Git 2.54.0, and correctly flagged
missing/outdated Zero/Java support in the existing Zero profile. No tools,
extensions, profiles or existing projects were installed, repaired or changed.

Native picker cancellation and existing-folder protection passed. Copying to a
fresh folder with spaces preserved all 126 bundled files and executable modes;
the protected existing Main.java was unchanged, with no partial-copy residue.
Continue setup launched the exact copied Setup.command in Terminal (process
verified); the owned test launch was stopped without choosing repairs. Open folder
revealed the copied folder in Finder. Separately, its actual guided menu ran in an
exec PTY with only Check again and Exit; exit 1 correctly reflected incomplete
profile readiness, not a launcher crash. Native Terminal GUI control remains
restricted, so this is launch plus separate CLI-menu evidence.

The copied starter compiled using JDK 21, the pinned Maven 3.9.11 wrapper and
JavaFX 21.0.12, with fresh test-owned dependency caches. Main started; its owned
process was deliberately stopped. A temporary subclass of unchanged Main used
ready(Stage) to verify a showing stage and visible “Hello, world!” label, then
exited cleanly: BUILD SUCCESS, passed:true, stageShowing:true, javaVersion:21.0.1.
The JavaFX window was not exposed to native UI automation; this is application
runtime evidence, not a visual UI observation. Removed the probe and clean-compiled
the original four sources successfully; all 126 original files/modes still match.

Ignored receipts and native copy screenshot:
`.verification/signed-mac-test-gu79ylnd/{result.json,javafx-probe.json,placed-kit.png}`;
active receipt `.verification/mac-signing/active-install-test.json`.
Coordinator handled this bounded test directly; no worker/review wave or runtime
source changes. Weekly 98% remaining was account-wide allowance, not task cost.

A local-only browser download attempt failed (origin discovery, then navigation
timeout); its server was stopped. The verified Downloads copy had no quarantine
attribute. Browser-download/first-open security prompts, full profile-import/trust,
missing-tool installations, a fresh Mac, physical Intel, restricted networks and
novice usability remain untested. Prior Gatekeeper CLI acceptance and earlier
isolated VS Code Run/autosave/default-build/Stop evidence remain applicable, but
those editor flows were not rerun here. Windows stays deferred. No publication.

## Calm Mac setup 0.5.5 — 2026-10-11

Reviewed source `ceaff5f201fd4e04ed56dc6d80ea4743c292ef3b`, clean build;
feature base28e39a8, initial9625801. Main AppKit window is fixed440×180 content
(440×212 including titlebar), with one replacing short message, spinner,
primary action and optional separate Details. Required first-time profile
instructions appear in the main window, with explicit Copy profile path and
actual Check profile. Missing VS Code/Java use deliberate official-download
handoffs; only editor extensions install in the background after approval.
Manual shell flow retained; native Homebrew execution removed. Existing compatible
profiles/tools, fresh-folder protection, useful errors and readiness rechecks kept.

One GPT-6.1-Sol/high implementation worker and two independent initial reviewers;
manual-fallback exit, possible native Homebrew elevation and hidden essential
profile directions were corrected in one batch. One targeted GPT-6.1-Sol/high
review accepted all three corrections with no new findings. Complete initial
coverage plus affected correction callers retained:3review launches,1initialwave,
1targetedwave,1fixbatch; no redundant integration wave. Targeted review approximately
3min; effective model/tokens/attributable cost unknown. Weekly96% remaining at
start was account allowance. Source verification:62shelltests,108nativeassertions,
48focused Node checks, configuration/syntax/contracts/links, Intel Swift typecheck,
Bash syntax, ZIP/source/license/mode parity and extracted Maven compilation passed.

Actual CUA fake-runner UI checks cover spinner/disabled action, status replacement,
ready, separate Details, failure/retry, five visible profile steps, deliberate
copy and Check profile before extension approval. Inputs/commands are disposable;
this is not real installation or profile-import evidence. Actual final signed
app ran on ARM64/macOS26.6.2, passed read-only auto-check and copied a fresh folder
with spaces:all126bytes/modes match ZIP. Main status correctly requested editor
support approval; that action was not selected. No host installs/profile/account
changes or actual editor handoff. Native apps/processes/volume used for this test
closed/stopped/ejected. UI captures remain440×212.

Developer ID Application signing identityACE8EE40F3615C5062CBBD5F085E299E049BAE08,
team88FT6QZJP8; universalARM64+x86_64 app targetsMac12, hardened runtime,
secure timestamps, no entitlements. Existing credential/profile reused privately.
Apple accepted job `139fb1a8-c095-46a1-a238-3ec5b33919a8`, no issues; submitted
SHA256 `64e04046c0513200cec15b6686f38fdf1ff942cf86904f98afa7f38d79a04c3e`.
Staple validation, actual Developer ID app/DMG signatures, Gatekeeper acceptance
of both and full signed artifact verifier passed. Final690095-byte
`Zero-Setup-0.5.5-macos.dmg` SHA256
`bc98b496ff2077c8aee68b927411a1fee10011a52d2437a6cf57044a54204205`.
Identical copy in `/Users/stew/Downloads/Zero-Setup-0.5.5-macos.dmg`.
Regenerated237754-byte `dist/zero-bootstrap.zip` SHA256
`f506e415711ef1041fc8ca368755b1c9575fb592b8f94112b0332facfada6d5b`.
Previous0.5.4 signed/notarized DMG and receipt preserved, Downloads hash unchanged.

Ignored receipts: `.verification/calm-mac-setup/` contains review-ledger.json,
source-checks.json, ui-result.json, profile-step.jpg, signed-screen.jpg,
signed-ui-result.json, notarization-{input,submit,log}.json and submitted-0.5.5.dmg;
`dist/installers/build-macos-signed.json` binds source, kit, signer and final bytes.
Shell result `.verification/native-installer/macos/shell-remediation-final.txt`.
Source-bound isolated VS Code1.141 CLI evidence confirms absent profile cannot be
quietly created/imported by extension-management commands; supported editor UI
import stays manual. No internal profile storage manipulation.

Untested: fresh-Mac/vendor tool installs, actual first-time profile import/trust,
quarantined browser first-open, physical Intel/macOS12 runtime, restricted school
networks and novice usability. Windows explicitly deferred. New starter runtime/
editor Run was not rerun; unchanged earlier recorded evidence remains historical.
No push, PR, merge, public release/deployment, host repairs, new certificate,
account/Keychain policy changes or credential disclosure. Local candidate only.

## Signed Mac 0.5.6 student-flow verification — 2026-10-11

Source `7d8db9bead9bc61ed556810df5373cb2e14dde45`, unchanged reviewed Mac/runtime.
Apple accepted submission `4ba0305b-a1de-4fc5-b4b1-4b7732e50a95`; signing,
stapling, Gatekeeper app/DMG and `verify-installers.mjs --platform macos --signed`
passed. Final 691970-byte DMG and Downloads copy SHA256
`4aba28b32da54fbd5fc8aa756dce4f33fbdc2fc02f6ad1c6089aff0bb088709d`.
Same exact 0.5.6 kit as unsigned Windows candidate; no publication.

On existing ARM64/macOS 26.6.2, actual signed setup copied all 126 files/modes,
guided supported first-time Zero profile import in disposable editor data,
installed Zero/Java extensions after explicit selection, rechecked readiness and
opened the minimal sidebar/first lesson. Actual sidebar Run launched unchanged
Main; Stop ended its processes and reported App stopped. Separate finite JavaFX
probe verified a showing Stage and Hello, world! label with JDK 17.0.14 and JavaFX
21.0.12. CUA does not expose JavaFX windows, so visual greeting remains unconfirmed.
Temporary source removed, original four-source clean compile and byte/mode parity
passed. Owner editor preserved; owned test apps/mount/server cleaned up.

Local website home/Learn and all three 0.5.6 download hashes passed HTTP checks.
Independent audit confirmed public 0.5.3 ZIP/starter/VSIX hashes; native DMG/EXE
links are not implemented. `npm run check` and `git diff --check` passed.
Receipts and complete source/artifact/delegation details: [EVIDENCE.md](EVIDENCE.md),
`.verification/mac-056/` and `dist/installers/build-macos-signed.json`.

Not tested: missing-tool vendor installs on a fresh Mac, browser quarantine,
physical Intel/macOS 12, restricted networks, novice usability or Windows. No
GitHub connection/upload in this trial; test folder inside the worktree correctly
blocked connection. Existing standard-build/autosave coverage remains historical.

## Mac download and local release candidate — 2026-10-11

Implementation `779d856f24c37f303842b1a14a8bdc30dd5fb415` independently reviewed
against1ef5ceb: complete scope, no findings. Configuration/diff, website30tests/
typecheck/build, new candidate/source2tests and existing publisher43tests passed.
Actual browser landing/header navigation and Mac/ZIP/manual choices verified.
Production HTTP verified exact DMG and3kit bytes; local-disabled and VERCEL=1
redirected303, unknown Windows download404. Published URL promotion remains
unperformed; no public native URL is authored.

`npm run release:prepare:mac` completed on clean reviewed source, reusing existing
artifacts. Kit/source/archive/Maven and signed DMG payload/Developer ID/staple/
Gatekeeper verification passed. Sealed `dist/candidates/mac-0.5.6-779d856f24c3/`;
all10SHA256SUMS entries and baseline artifact parity passed. Original built source
7d8db9b and preparation source779d856 are separately recorded, with protected-source
equivalence. Existing output refusal tested. No rebuild/signing/notarization upload.

Receipts/screenshots and full artifact/review details: [EVIDENCE.md](EVIDENCE.md),
`.verification/native-download/`. Owned preview tab/servers closed. Public website
and0.5.3 downloads unchanged; PR/merge/publication/deployment not authorized here.
Windows deferred; fresh-machine, browser quarantine and physical Intel/macOS12
runtime gaps from the prior Mac trial remain. No new installer execution in this
phase. Subsequent maintainer evidence edits preserve reviewed runtime/prep behavior.

## Owner visual greeting confirmation — 2026-10-11

After a delayed reply to the earlier window check, the owner noted they may have
closed the app. Relaunched unchanged four-source Main through the copied starter's
Maven wrapper (`clean compile javafx:run`), then verified its owned process running.
Owner confirmed: “yes i see the hello world window”. This establishes a fresh
manual visual observation; it does not retroactively claim CUA saw the earlier
sidebar Run window. Greeting left open for the owner to close. Receipt:
`.verification/mac-056/manual-greeting-run.json`. No source, candidate artifact,
profile, credential or publication changes. Other platform/setup limits remain.

## Publication integration checks — 2026-10-11

Owner authorized source PR/merge, exact signed Mac0.5.6 publication and website
update. Preserved `release/published-kit.json` from canonical main
`cbd12ad1b67252f6c4c33fbbe22aa40052eb0791`: all three public0.5.3 assets freshly
verified without authentication against exact size/SHA256. Website selects a
published current kit, explicit local preview, or this verified fallback; download
labels distinguish kit0.5.3 and Mac0.5.6. Existing three-asset publisher now accepts
only a direct kit link or the same-site Learn chooser with one actual kit anchor
inside the downloads section before measuring its bytes. Native metadata tests
validate the authored state and use explicit local/published fixtures.

One bounded GPT-6.1-Sol/high implementation worker, no recursive delegation. Final
checks: website34tests/typecheck/build, release53guards, Maccandidate2tests, root
and diff checks. Coordinator reused full247extension/setup tests and8installer
tests completed in this publication phase. All10sealed candidate checksum entries
passed; signed installer bytes remain unchanged. Public fallback receipt:
`.verification/native-download/published-kit-fallback.json`; delivery receipt:
`.verification/mac-publication/delivery.json`. Final independent integration review
and GitHub source CI precede merge/publication. Physical Windows remains held;
primary funding checkout and Community untouched. Effective model/task tokens and
attributable cost unknown; weekly91% at start is account allowance.

Final integration review `mac_publication_integration_review/turn1`, requested
GPT-6.1-Sol/high, completed cumulative basecbd12ad→headc36bad4 and new delta98242ea:
reused documented unchanged phase security/runtime coverage; one accepted P2
blocker in hosted setup/starter guidance naming unavailable VSIX/launcher versions.
Correction is hosted/docs-only: both routes share download-aware setup guidance,
use the downloaded kit’s VSIX and explain optional launcher availability. Sealed
packaged sources and installer bytes preserved. Targeted review follows corrected
head;1initial launch/1fixbatch so far. No additional code findings or coverage gaps.
Local browser confirmed fallback home/Learn/Other downloads0.5.3 labels/links;
receipt `.verification/mac-publication/fallback-ui.jpg`.

Targeted review turn2 at5245af2 completed: original version guidance resolved;
one accepted P2 mapping regression removed legacy packaged starter links from
hosted navigation. Corrected with explicit hosted source/anchor aliases for setup
and Pika, preserving protected source. Related nonblocking P3 profile wording
corrected: separate extension download, optional profile from complete ZIP.
Ledger2review turns/1targetedwave before this second fixbatch.

## Authorized source merge and Mac publication — 2026-10-11

[Source PR22](https://github.com/codepetca/zero/pull/22) merged with a merge commit
`34415b9d5c52d348936df82f9dfd202ceae627a7`, preserving preparation source history.
Final reviewed head9eee284731d06f5a4ce42c58021b80f17483fd88;
[CI38164762983](https://github.com/codepetca/zero/actions/runs/38164762983) passed
including finite JavaFX examples, website and kit preparation. Independent
mac_publication_integration_review/turn3 completed correction5245af2→9eee284 with
no new findings; complete original coverage plus targeted deltas retained.
Review ledger3turns/1initialwave/2targetedwaves/2fixbatches, no failed launches.
Requested GPT-6.1-Sol/high; effective model/task tokens/attributable cost unknown.
Browser verified legacy lesson setup link opens the expanded correct hosted
section. Website36tests/typecheck/build and configuration/diff checks pass.

[Zero Setup0.5.6](https://github.com/codepetca/zero/releases/tag/setup-v0.5.6)
publishes exactly one DMG,691970bytes/SHA256
`4aba28b32da54fbd5fc8aa756dce4f33fbdc2fc02f6ad1c6089aff0bb088709d`.
Immediately preceding creation, release/tag absence checked; all10sealed candidate
checksums passed. Draft target779d856f24c37f303842b1a14a8bdc30dd5fb415, singleasset
name/size/GitHubdigest and authenticated downloaded bytes verified. After deliberate
publication, actual asset URL downloaded without authentication: HTTP200, exact
size/hash and tag commit verified. Source build7d8db9b recorded separately.
Installer unchanged from sealed signed/notarized/stapled candidate; no rebuild or
new signing/notarization. Publication notes explain current distribution/testing
limits; original sealed candidate notes remain unchanged.

Only native URL/status promotion follows in a separate reviewed metadata PR.
Standalone0.5.3ZIP/starter/VSIX preserved; local0.5.6kit not independently published.
No Windows release, account/credential/security changes, Community edits or primary
funding checkout changes. Physical Windows and fresh-machine/quarantine/Intel/
macOS12/novice-use limits retained. Exact release/draft/tag/public receipts at
`.verification/mac-publication/`; live deployment verification remains pending.

## Completed production download rollout — 2026-10-11

[Metadata PR23](https://github.com/codepetca/zero/pull/23) reviewed at
a19e6133d175edb5e12ef957645ad33c8842ed45, merged7b0320e5eb3f84e695c305d8ac2b77b19c9d7745
after [CI38165240574](https://github.com/codepetca/zero/actions/runs/38165240574).
Independent mac_public_metadata_review/turn1 requested GPT-6-Luna/medium: complete
six-file diff/receipt/caller review,0blockers; independently validated sealed
manifest equality except status/URL and9targeted website tests. Existing product
distribution labels were sufficient; optional repeated maintainer-state wording
was not needed. Full36website tests/typecheck/build and root/diff checks passed.
Metadata review1launch/1initialwave/0fixbatches; effective model/tokens unknown.

Vercel production succeeded for exact7b0320e merge. Live
[Download Zero](https://zero.codepet.ca/) opens `/learn#downloads`; Mac0.5.6 is
primary and separately labelled0.5.3ZIP/starter/VSIX remain under Other downloads.
All four real anchors retrieved without authentication: HTTP200, exact pinned
sizes/SHA256. Actual CUA browser home→Download Zero→Download for Mac saved the
691970-byte DMG with matching
`4aba28b32da54fbd5fc8aa756dce4f33fbdc2fc02f6ad1c6089aff0bb088709d`.
Download saved as `Zero-Setup-0.5.6-macos (1).dmg` beside the existing Downloads
candidate; not launched again. Local preview tabs/servers cleaned up.
Receipts/screenshot: `.verification/mac-publication/live-verification.json`,
`browser-verification.json`, `production-deployment.json`, `live-downloads.jpg`
and completed `delivery.json`. Coordinator checkout synchronized to remote main
before this local completion-note commit; primary funding branch untouched.

Authorized task complete. Existing candidate/public assets immutable; no extra
kit/Windows publication, signing/notarization, credentials/account/security changes.
Windows physical testing remains held; fresh-Mac vendor/quarantine, Intel/macOS12
and novice classroom trials remain unverified. Greeting window remains owner-owned.

## Default native setup location — local source, 2026-10-11

Owner requested default location instead of a mandatory folder picker. Next native
build offers Set up Zero at user-home/Zero plus optional Change location, with
Zero-2 through Zero-1000 for any occupied entry. Selection is read-only, copying
requires the primary action and retains exclusive placement/close/cancellation
guards. Lookup/permission/exhaustion errors preserve manual location choice;
collision races preserve the existing project and allow explicit fresh retry.
Published Mac0.5.6 and its sealed candidate are unchanged; new release required.

Two bounded GPT-6.1-Sol/high workers, one writer per platform; no recursive
delegation. Mac145harness assertions and ARM64/x86_64 source compiles passed.
Windows153Mono backend/controller checks,3portable PowerShell parser/mock tests
and net48 harness/WinForms cross-build passed with0warnings/errors. Coordinator
root/diff,8installer and2Macsealing tests passed. No dist/candidate replacement,
installation, signing/notarization, GitHub publication or account changes. Actual
Windows/WinForms remains untested/held; Intel/macOS12 execution not established by
compilation. CUA AppKit fake-only preview verified the one-line default screen,
optional picker cancellation retaining the default and primary→ready without a
mandatory picker. All copy/command actions used disposable fixtures/fakes; no host
installation. Screenshot `.verification/default-folder/mac-default.jpg`.

Independent default_folder_review/turn1 requested GPT-6.1-Sol/high completely
reviewed all13changed files and immediate native placement/lifecycle/UI callers at
0adb412b537ed0edd6d83e820192d033339f536a against
fc25c39cab143a13709977a959909727c289f756:0actionable findings/blockers, exact-range
diff check passed.1launch/1initialwave/0fixbatches; approximately90reviewer seconds.
Existing harness/build checks reused; no extra integration wave needed because
reviewed source is unchanged. Final delta records this evidence only. Local source
accepted; no source push/PR or new installer release performed.
Receipts `.verification/default-folder/`; weekly89% at start is account allowance,
effective models/task tokens/attributable cost and coordination time unknown.
Primary funding checkout and Community untouched.


## Fixed native location and confirmed setup updates — local source, 2026-10-11

Owner removed location/name choices and numbered alternatives, then requested
existing-folder updates with a warning while preserving saves. Local native setup
uses only user-home/Zero. Existing recognizable kits get Update Zero/Cancel:
“Setup files will be replaced. Your code, assets and saved projects will be kept.”
Cancel writes nothing. Files/links/unrelated Zero folders are refused. Fresh
placement retains exclusive publication and never upgrades a raced target silently.

Only allowlisted setup runtime, guide/license, metadata and the current VSIX change.
Entire starter (source/framework edits/POM/wrappers/settings/Git/assets/saves),
optional files, extras and old VSIXs remain unchanged. Replaced files are backed up
with a Details path. Transaction guards serialize updates, verify target identities,
commit metadata last and attempt rollback without discarding recovery data.
Student project/API upgrades remain separate from updating setup.

Two bounded GPT-6.1-Sol/high platform workers completed; one writer per platform,
no recursive delegation. Mac179disposable/fake assertions and ARM64/x86_64 macOS12
production compiles passed. Windows228net48/Mono assertions, including an update of
the existing packaged kit and concurrent-edit regressions, passed; WinForms
cross-build0warnings/errors. Coordinator root check,8installer tests,2Macsealing
checks and diff checks passed. CUA fake-only Mac preview verified the minimal
screen, native warning, Cancel→unchanged and Update Zero→ready. Screenshot
`.verification/upgrade-default/mac-confirmation.jpg`; owned test process terminated.

Complete independent GPT-6.1-Sol/high preservation and workflow reviews inspected
886953f4d92049dbb8224ec47caa17d836635e58→6d4fced89a0b73c781790ff1284a7da6bcc709f8.
One accepted P2: Windows could lose runtime edits made during commit/rollback.
Correction6abdac87cf358fd9ba0f7c7cf198cc04d0158ed3 atomically retains actual replaced
entries and rollback targets, detects drift and keeps ambiguous recovery backups.
Complete targeted preservation review of the two-file correction: resolved,
0newblockers.3review turns/1initialwave/1targetedwave/1fixbatch. Unchanged Mac and
workflow coverage reused; no additional integration wave needed because the
correction stayed inside the reviewed filesystem boundary and targeted review
covered retry/metadata interactions. Windows/Mac recognition criteria differ,
but both refuse unsafe targets and preserve student files; no demonstrated
workflow blocker. Requested models/efforts recorded; effective configuration,
per-turn tokens/elapsed/cost and coordinator active time unknown. Overall session
timestamps are in `.verification/upgrade-default/review.json`; weekly89% remaining
at start is account allowance, not task cost. DeepSeek remains paused.

Local source accepted only. No source push/PR, signing/notarization, dist rebuild,
release replacement, deployment, account/credential changes or actual tool installs.
Public signed Mac0.5.6 still uses its old picker; a new versioned verified release
is needed to deliver this flow. Primary funding checkout and Community untouched.
Windows physical/native handle/WinForms testing remains held. Physical Intel,
macOS12 execution, fresh-machine vendor/trust flows and novice use remain untested.
Receipts `.verification/upgrade-default/`; prior optional-folder behavior above
is historical and superseded by this phase.


## Automatic Mac onboarding — local 0.5.7, 2026-10-11

Native Mac setup now prepares a pinned private Temurin JDK21 and isolated editor
configuration with one Set up Zero action. It reuses compatible installed VS Code
or downloads a pinned Microsoft build, verifies archives/signatures, installs Zero
and Java support, and offers Open Zero. No profile import, global JAVA_HOME editing,
Homebrew, Python or Node is needed by students. Open Zero.command returns to the
prepared editor. Fixed ~/Zero, the update warning and student-file preservation
remain. Progress uses one changing line; GitHub sign-in remains separate.

Implementation3dcc851 passed247root tests,14packaging/sealing tests, check/diff,
kit extraction verification,173native disposable assertions,62manual shell tests
and both Mac architecture production compiles. Official ARM64 JDK/editor archives
were downloaded, size/SHA256 checked and passed actual vendor signature checks;
VS Code passed Gatekeeper assessment. Real archive extraction and configuration
in a disposable home installed the actual packaged Zero0.5.7 and Red Hat Java.
The real editor test passed Run→visible JavaFX Hello, world!→Stop,500msautosave,
standard build→Hello, Mac!→Stop. Both child apps used Zero's private Java.
CUA fake-only native preview verified the fixed one-line status and Open Zero.

Two fresh GPT-6.1-Sol/high complete-diff reviews of1d5fa05→3dcc851 found twoP2s:
a concurrent student launcher could be replaced, and a failed settings write could
leave partial JSON that retries preserved. Correctione10cce79 passed189native
assertions and both Mac architecture production compiles. A fresh Sol/high targeted
review inspected the complete six-file correction, reused hash-matching checks
and passed eight independently compiled focused assertions. BothP2s resolved;
0newfindings or unresolved blockers.3review turns/1initialwave/1targetedwave/1fixbatch;
unchanged initial download/controller coverage reused, no additional integration
wave needed. Final real-vendor configure rerun passed ready=1.

Clean e10cce79 produced the universal unsigned development DMG
Zero-Setup-0.5.7-macos-development.dmg,883970bytes,SHA256
4fb8cdbec02315f14b51272cc32db1a34917432fa811bdbad2d9baa2c6766bfe.
DMG checksum, both architectures, bundled payload bytes and permissions passed
verify-installers. Kit ZIP regenerated/verified: zero-bootstrap.zip,240292bytes,
SHA256a7247dcbe6841c103c943a1fbd7d421790e10f3093e54cee4646de9e0e32db0b.
Final root check/diff and14packaging/sealing/kit tests passed. Development artifacts
are local only; no Developer ID signing or notarization.

Receipts .verification/easy-onboarding/: actual/runtime-result.json,
actual/vscode-smoke-result.json, actual/proof-limitations.json, vendor hashes,
macos/worker-receipt.json, tests.log, packaging-tests.log,
preview/{progress,ready}.png, macos/fix-batch-1-receipt.json,
review-fix/targeted-e10cce79/result.log, build-macos.log, verify-macos.log,
dist/installers/build-macos.json and independent reproduction harnesses.
Real editor proof used a short /tmp alias to its disposable user-data directory
because the long evidence path exceeds upstream VS Code's103-character IPC socket
limit. The extension test host required trust, granted through CUA only to the
verified disposable starter. No security protection was disabled. This is not a
clean physical Mac or exact default-home first-run proof. Intel/macOS12 execution,
quarantine/vendor prompts, restricted networks, novice use and Windows physical
testing remain unverified. Windows behavior unchanged in this phase.

No push, PR, publication, signing/notarization, website update or credentials change.
Public signed Mac0.5.6 and its sealed candidate remain unchanged. Local version0.5.7
is unpublished. Primary funding checkout and Community remain untouched.
Weekly87% remaining at start is account allowance, not task cost; effective model,
attributable tokens/cost and coordinator active time are unknown. DeepSeek paused.


## Signed Mac0.5.7 publication and website promotion — 2026-10-11

Owner's “Do it” authorized signing/notarization, native publication and website
update. Existing identity ACE8EE40F3615C5062CBBD5F085E299E049BAE08/team88FT6QZJP8
and private “Zero Notarization” profile reused; no certificate/credential changes.
Clean a9fb1ed built the universal macOS12+ signed app/DMG. Apple accepted job
3f1e1013-a4a3-4109-b6ae-999cb6881945, binding submitted SHA256
1475fa2591a1172402f8ec0f7fbd7829be4cded4702aa8d841feea6909df4ca1.
Staple validation, app/DMG signatures, actual Gatekeeper assessments and exact
payload/permissions passed. Final899924-byte DMG SHA256
 d639fc080670eb11fc03e63c56356c8da1603bf956e44d5b135511f52aa9ba1b.

Initial Vercel preview caught oldnative0.5.6/currentkit0.5.7 schema mismatch.
Correction aligned local native metadata to actual0.5.7 receipts, fixed version
negative/assertion fixtures and changed download/sealed-note copy to the automatic
Mac flow. No validator/trust guard relaxed. Fresh GPT-6.1-Sol/medium reviewed all
six files a9fb1ed→f9a5ef2;0findings/blockers;9independent focused tests passed.
Local36website tests/typecheck/build/root/2sealing checks passed. Prior accepted
native/default-folder source coverage reused; no native/runtime changes in this
release phase. Source PR24 merged at05951b2852039055891977b42ff9464736ab4a29 after
CI38178772418 and Vercel preview succeeded. Primary funding checkout preserved.

Candidate dist/candidates/mac-0.5.7-f9a5ef2bfcd3 sealed existing bytes without
rebuilding; all10checksums/source-equivalence passed. Draft had one DMG and exact
preparation source. Downloaded draft bytes matched before publication. Public
https://github.com/codepetca/zero/releases/tag/setup-v0.5.7 now targetsf9a5ef2;
unauthenticated publicHTTP200/exactsize/hash and tag source verified. Mac0.5.6
and its candidate remain intact. Standalone ZIP/starter/VSIX stay0.5.3, Community
0.1.3 unchanged. New native kit0.5.7 is not separately published.

Actual local browser Download for Mac action targeted verified native route; an
unauthenticated local retrieval matched the candidate bytes. Screenshot
.verification/mac-057-release/local-downloads.png. Public metadata and hosted
Mac/manual guidance PR25 merged atb9d0188e47ae0686890b4236f65ff1474fff4f9f after
reviewed e81091b and successfulCI38179369934/Vercel preview. Fresh Luna/medium
eight-file review05951b2→0e72a96 found1nonblockingP2 stale installer paragraph;
correction0e72a96→e81091b and targeted review resolved it with0newissues. One
reviewer launch/2turns/1initialwave/1targetedwave/1fixbatch for promotion; unchanged
metadata/source coverage reused. Preparation used oneSol/medium launch/turn,
1initialwave/0fixbatches. No repeated full integration review needed for the
single documentation paragraph.

Production deployment7002564608 succeeded for exact mergeb9d0188e. Live home,
Learn chooser and setup guide returnedHTTP200. Actual browser Mac button points
to the verified public0.5.7URL; unauthenticated retrieval of that live anchor
matched899924bytes and sealedSHA256. All three alternative0.5.3anchors unchanged.
Screenshot .verification/mac-057-release/live-downloads.png; live-verification.json
binds deployment, pages and downloaded bytes. Previous public0.5.6asset and
sealed candidate hash rechecked unchanged. Outcome complete; no native/runtime
changes in final local receipt-only documentation. Temporary local server stopped.
Remaining limits: clean Mac/vendor/quarantine/trust/novice flows, physical
Intel/macOS12 and Windows, restricted networks. Windows physical testing held.
Receipts .verification/mac-057-release/ and immutable candidate directory.
Requested worker GPT-6-Luna/medium inventory and Sol/medium preparation review;
effective model, per-turn tokens/cost and coordinator active time unknown.
Weekly86% remaining at start is account allowance. DeepSeek paused; no new goal,
task, automation, account changes or branch-protection changes.


## Local app/game tutorial pass — 2026-10-11

Owner deferred installer trials and selected study quiz + coin game. Local branch
codex/app-game-tutorials, baseline618fad209d9329815c7395660b31c1be967d6631,
accepted source f2753a081d20c77ceb3b26c1e7b8e14707c497b6 (20files).
Lessons7/9/10 now keep Restart visible, teach one-coin native controls before
arrays/win and reuse unchanged ScoreDisplay across SimpleApp and SketchApp.
Exact-copy switching backs up work outside src and removes unlisted helpers,
preserving zero/build files. UI.md explains one app, native controls around the
canvas, explicit updates, view ownership and focus; no nested SimpleApp. Beginner
default and Workshop0.1.3/two-healthbar limits corrected. Proposed welcome/result,
pause and Countdown helpers are distinguished from implemented APIs.

Eight finite actual JavaFX checks passed in disposable projects: study, coin-game,
coin-game-controls, coin-game-component, hello-world, hello-button, hello-name and
movement. They verify score-once, reset, retained controls, independent views and
canvas focus. Exact new source sets also compiled with Java17 target and pinned
JavaFX21.0.12. Reproduced old full-game→coin-game failure from stale Enemy/touches;
backup/remove-unlisted/exact-copy flow compiled. No student files touched.
Website36tests/typecheck/production build and root/diff checks passed. Actual local
browser verified UI guide navigation and final controls example backup/copy lists;
screenshot .verification/tutorial-pass/local-ui-guide.png is local docs proof,
not a game runtime screenshot or public deployment.

Fresh GPT-6.1-Sol/medium reviewer inspected all20changed files and immediate
framework/example/Workshop/source-routing contracts:0findings/blockers. Reused
coordinator test receipts; independently checked frozen HEAD/clean tree, whitespace,
generated source equality and example routes. No independent GUI rerun. One
review launch/initial wave,0fix batches/targeted waves/integration waves; default
7launch/4fix/60min caps retained. One Sol/medium audit/implementation worker;
coordinator owned shared guides, website and verification. No recursive delegation.
One unsupported example-name invocation rejected before tests; corrected once.
Weekly82% remaining at start is account allowance. Effective models, attributable
tokens/cost and active time unknown; DeepSeek remains paused.

Local source complete and unpublished. No core/library/API, dependency, version,
installer, ZIP, Community, account or remote changes. Existing Mac0.5.7 DMG hash
rechecked unchanged: d639fc080670eb11fc03e63c56356c8da1603bf956e44d5b135511f52aa9ba1b.
No push/PR/deploy. No novice trial, physical Windows/Linux/Intel proof or fresh
installer test; those remain deferred. Current Workshop checks only its two declared
health bars; general custom-component authoring/contribution needs a future pass.
Evidence .verification/tutorial-pass/; design docs/TUTORIAL-PLAN.md.


## Visual quick lessons, composition and local sharing trial — 2026-10-11

Owner requested visual/minimal-reading lessons and an actual component-building/
sharing trial, including composable HUD/start-screen parts. Local source
6e32ecccb4f317e6b605fcbe9d23258229c3027d, baseline3f4a36792b52e229725f63125653900dee955128,
47files. All13lessons now begin with standalone accessible target SVG illustrations,
three actions and an observable checkpoint. Existing code/explanation retained;
later lessons start with one runnable milestone. Illustrations are not screenshots
and no novice completion time is claimed. Hosted intro appears before folded
detail, with code anchors and fixed asset mapping. Desktop picture/actions share
one grid;390px viewport stacks with no horizontal overflow. Local Markdown retains
the assets. Actual browser code-link reveal, lesson10 and six-file composed-game
copy page verified; screenshots .verification/visual-composition/lesson-1.png and
lesson-1-mobile.png are local website proof, not public deployment.

New composed-study/game reuse unchanged StartScreen/Hud source plus canonical
ScoreDisplay and original Question/Player/Coin helpers. Hud contains ScoreDisplay;
Main supplies actions and owns state/rules. Study switches native views. Game keeps
canvas mounted, explicitly gates updates, reserves Hud room during setup, resets
existing views and returns Scene keyboard focus ownership to canvas. Exact source
sets compile. Fourteen finite actual JavaFX cases,38website tests, typecheck,
production build, root and whitespace checks passed. New cases exercise menu/
activity/completion/restart, duplicate score prevention, independent Hud actions,
view identity, layout bounds and deterministic held-key movement. Physical input
not demonstrated. Initial synthetic key-event movement failed twice because the
native window was unfocused; harness now follows MovementCheck's deterministic
held-input method, retains focus-owner checks, and explicitly labels this limit.
One coordinator layout correction handled parsed whitespace before Done; regression
check proves every lesson produces the visible quick-path wrapper.

Separate Sol/medium worker copied trusted Community into ignored disposable
fixtures: two reproducible builds,6JavaFX checks,4Maven consumers, native Workshop,
baseline export and independent admission passed. Editing HealthBar caption
rejected stale evidence; fresh CandidateBuild/export/independent admission passed.
Packets report checked, communityReviewed=false/publishAllowed=false. Arbitrary
StartScreen metadata is rejected by the current healthbar-only contract. Receipt
.verification/component-flow-trial/receipt.json; commands/limits NOTES.md there.
One fixture rerun created an omitted export parent; not a product defect. Real
Community remains clean at31febf2f22228553e40e96abe92bcbbf83032815. Its contribution
guide's eight-owned-file count and enforced-protection paragraph are stale;
follow-up recorded rather than silently changing that repository. Generic component
workbench remains planned in docs/TUTORIAL-PLAN.md, not claimed as built.

Fresh GPT-6.1-Sol/medium independent reviewer inspected the complete47-file diff
and immediate renderer/build/framework/shared-class contracts:0findings/blockers.
Reused tied check/trial evidence, inspected both screenshots, independently checked
fixed HEAD/clean tree and whitespace. One launch/initial wave,0fix batches,0targeted
or integration waves; default7launch/4fix/60min caps retained. Three Sol/medium
workers owned visual lessons, composition examples and disposable trial; coordinator
owned web/harness/integration. No recursive delegation. Effective configurations,
attributable tokens/cost and active time unknown; weekly81% remaining at start is
account allowance. DeepSeek stays paused. No new goal/task/automation.

Local source accepted and unpublished. No push/PR/deploy, core/dependency/version/
installer/ZIP/Community/account changes. Physical input/DirectoryChooser, Windows/
Linux/Intel, novice timing, public submission/maintainer acceptance/install remain
unverified; installer trial held. Existing published releases retained.


## Local Starter UI package proof — 2026-10-11

Owner approved the recommended local package before generic Workshop/catalog work.
Accepted Zero e7b03d8ab37c9c3323e04462b705b993d2f2ba1b (base862c081), Community
19e3544da52691c1d39492fb78ee9dd962898536 (base31febf2),23changed files total.
Community packages/starter-ui owns three ordinary classes, namespace
zero.community.starterui, coordinate ca.codepet.zero.community:starter-ui:0.1.0-prototype.1.
Java17/JavaFX21.0.12, MIT; no core/Application/game classes or core dependency.
Packaged-study/game preserve composed rules and differ only by imports, with exact
ordinary helper lists. Default-package teaching sources remain untouched.
No default POM/catalog/healthbar/admission/workflow/installer changes.

Final proof .verification/starter ui accepted source/receipt.json passed in33.97s:
two byte-identical clean binary/source builds; exact entries and current Java/POM/
MIT bytes; installed-artifact equality; finite native JavaFX component/callback/
independence/error checks and origin binding; both packaged consumers. Components
loaded from the exact isolated-cache JAR, not copied source. Empty explicit user/
global Maven settings apply to every package and consumer step; output paths with
spaces work and existing outputs refuse replacement. Library artifact6539bytes
SHA256 e0d1c551071c1ce2ab920a34f9932e1070536161d71a2ae053960c24fe5444a8;
source JAR4661bytes SHA2563dfeab1bd0304c5040551ab433adf2753f5fed76d236ab6937ab7af379e4ac1f.
POM2314bytes SHA25647e1b4fffc8710dfd1bddeacf9073f7c8d3cc5f0a2d3d75f1a43ce8a1557a5cd.
Root rechecked all9module input hashes against final receipt. Baseline composed
study/game/Hello-world finite checks,38website tests and root/diff checks pass.
Public example shelf remains unchanged; packaged consumers are local maintainer
proofs, not a downloadable student catalog option.

One Sol/medium worker delivered module/check/tool; coordinator owned consumers,
harness/integration/docs/Git. Initial wrapper-location mistake corrected before
Maven; coordinator tightened child empty-settings propagation and removed local
branch GitHub links before final proof. These were pre-review corrections. Final
fresh Sol/medium reviewer inspected both full diffs and immediate dependencies,
independently verified9module hashes/digest, archive/POM/license/source/artifact
bytes/origins and namespace/import-only differences:0findings/blockers. Reused
applicable native/build/test receipts; no repeated suite. One launch/initialwave,
0review fixbatches/targeted/integration waves; default7launch/4fix/60min caps retained.
Effective models/tokens/cost/active time unknown; account weekly80%remaining at start
is not task cost. No recursive delegation, DeepSeek (paused), new goal/task/automation.

Local source and JAR/source/POM accepted; no push/PR/publication/deploy/account or
protection changes. Separate Community worktree/branch preserves canonical main;
primary Zero funding checkout untouched. Current Workshop only supports health
bars; general descriptor/check/preview and multiple-library discovery remain next
planned contracts. No Community admission/recommendation or public artifact install.
Physical input, Windows/Linux/Intel, novice and restricted-network behavior untested;
installer/physical Windows trial still held. Earlier published artifacts retained.

## ZeroHub consolidation — 2026-10-12

Owner approved one Zero repository, ZeroHub branding and `/hub`, removal of the old Community workflow without legacy compatibility, and retirement after verification. Source commit19eaad79835ee0f7c4a6f0e4499c6053bff60d1a; two tutorial sentence corrections3d21d0bf4d5c9ea1b2ea468670a61083ca8f91b6.

Moved maintained Starter UI and health-bar bundles into libraries/ with MIT notices and source provenance. Single-repo namespaces zero.starterui/zero.healthbars remain separate from assigned ZeroHub namespaces zero.uiN. Removed Workshop, old catalog/static Maven routes, legacy editor actions and component ZIP dependencies. Extracted surviving POM/scanner/process helpers unchanged. Website route /hub; auth returns /hub/prepare; backend /api/hub preserved.

Passing evidence: configuration/syntax/command/doclink checks;175 root tests;61 focused editor/process/release checks; website38pass2opt-in skips/types/build; actual productionHTTP2/2 (canonical wrapper bytes, /hub navigation and retired route404s);18 actual PostgreSQL cases; rebuilt ZIP/VSIX/extracted Maven compile. Retired tests covered only deleted behavior; scanner/version/edit and process checks remain.

Ignored native receipts: .verification/zerohub-starter-internal/receipt.json (18.37s; two reproducible builds, source/notices, checks, both real JAR consumers); zerohub-health-bars-final/receipt.json (6retained tests,2expected mutant failures,4native consumers/JAR origins); zerohub-internal-full/receipt.json (47.064s; failed/corrected same version, immutable0.1.0/0.1.1, actual extension Add/Update/Revert, both apps0.1.0→0.1.1→0.1.0 and artifact hashes). Existing pinned checker image/policy reused, unchanged.

Browser receipt .verification/zerohub-consolidation-browser/receipt.json records actual sign-in at /hub/prepare, reservationui2, ZIP download, edited-folder upload, automatic local listing, credit/profile, import/pin/check details and logout. Listed UI/screenshots overview.jpg and listed.jpg visually inspected. The downloaded edited preview ran on macOS (ZEROHUB_DOWNLOADED_PREVIEW_OK). Production Next Maven gateway proof zerohub-consolidation-proxy/receipt.json began without hub coordinates, resolved exact published JAR hash and ran native packaged-study/game. This is local fake publication with demo identity101/zero-local-demo, not hosted OAuth or public release.

Independent GPT-6.1 Sol/high consolidation review turn1 completed the full142path19eaad7diff with0P0/P1/P2 blockers. It confirmed nine helper functions byte-identical, exact packaged source, removed dependencies/routes, source/license/proof consistency and unchanged Origin/cookie/session/CSRF bounds. TwoP3 wording nits fixed together; turn2 reviewed19eaad7→3d21d0b and closed both with no new findings. Prior unchanged coverage retained; no redundant review wave. Cumulative hub/contributor/consolidation reviewer turns11 (including3earlier provider-filter failures); consolidation2turns,1small docs correction, no implementation rework or writer conflict. Two new bounded source workers Sol/high (libraries, website), coordinator integration/browser/Git. Effective runtime configuration, tokens/cost and coordinator active time unknown. Weekly remaining70% at phase start is account-wide, not task cost.

Remote retirement: gh repo delete codepetca/zero-community --yes succeeded; authenticated subsequent repository lookup returnedHTTP404. Complete21ref history verified in /Users/stew/.codex/archives/zero-community-20261012.bundle. Original local source checkouts retained solely as recovery material; no product dependency remains. Zero was not pushed, PR'd, merged or deployed. Primary funding changes untouched. Owned test browser/server/PostgreSQL resources stopped; all23existing Pika/Supabase containers remain running/healthy where configured. Storage guard301GBcached then322GBfresh healthy; no cleanup/restart/pruning.

Limits: generic checker-security source review still incomplete after earlier provider rejection; this consolidation review does not substitute or bypass it. Hosted OAuth/database/storage/worker provisioning and rollout remain separate. Physical Windows/Linux/Intel, novice/manual installed-editor flows untested. No installer rebuild/signing/publication in this phase.

## Public read-only ZeroHub — 2026-10-12

Reviewed source b0e7177686d68b9b4ce7ba039e0c062a0b3d2c74 is deployed on Vercel (dpl_5ZCSuaG1w3XZWL4D2PjrigEBSATJ) and promoted to https://zero.codepet.ca/hub. Draft PR26 remains unmerged because the excluded generic checker review is incomplete. Neon was provisioned through Vercel, then reviewed schema/storage and distinct minimal SQL logins were installed. Production has only its restricted API URL and closed embedded-runtime settings; admin/bootstrap credentials stay private and out of deployment inputs.

Passing checks:21actual PostgreSQL authority/integrity/selection cases;5bootstrap unit cases/1optional skipped by default plus separately executed real maintained-source Docker proof;43website cases/2optional HTTPskips; types/build/root checks. Hosting5independent review turns resolved2blocking findings (runtime role escalation, github.com identity binding) with no remaining assigned hosting findings. Earlier checker-source gate is unchanged.

Actual production maintained Starter UI ui1:0.1.0 published with authenticated contributor4050555/armorup, three components and all6checks passed on LinuxARM64. Exact repeat reused immutable bytes. Anonymous catalog/credit, all4artifact byte hashes and HEAD, anonymous session, closed authoring503 and current/retired page statuses passed. Browser search, imports/pin/API/check details/profile/previews passed. Actual public Maven JAR hash matched cache; both study/game finite native checks passed on this Mac. Proof paths and exact review/deployment receipts are in [EVIDENCE.md](EVIDENCE.md).

Public uploads, OAuth and hosted generic execution remain closed; operational quotas/backups/monitoring/removal and permitted independent checker acceptance are unfinished. No new installer/kit release or main merge. Mac synthetic UI actions and LinuxARM64 virtual-display checks do not prove physical/novice/Windows/Linuxdesktop/Intel use. Primary funding work and existing Pika services were preserved; owned local test server/databases stopped.

Docs-only follow-up28f6e58 completed independent Luna/medium9-file review0blockers and GitHub CI. Promoted deployment dpl_EYggD2cbHDqFXpt1Jhto9uY3eMox includes the current-kit manual import guidance and closed-sharing lesson11 note. Coordinator verified their actual anonymous public responses and unchanged closed catalog; public-docs-receipt.json retained. Application code is unchanged from reviewed b0e7177; no extra native consumer run or checker acceptance was inferred from this docs deployment.
