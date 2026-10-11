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
