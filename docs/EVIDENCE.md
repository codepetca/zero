# Delivery evidence index

## Calm Windows setup 0.5.6 — local delivery, 2026-10-11

Reviewed runtime source `889e76690b2cc10835d16b12c0b4c8fa1bd311c3`; base
`7c6aeb7`, initial feature `018eb474feb10d61bf75147cc91974afc137394d`.
Fixed440×180 WinForms content window uses one replacing short status line,
progress indicator, primary action and optional separate Details. Native checks
and approved editor extensions capture output in background. Missing system tools
use deliberate official-download handoffs; vendor installers can show their own
prompts. Main window guides profile import and explicit path-copy step by step;
actual profile/extensions/readiness rechecks precede Open. Manual ZIP menu remains.

One implementation worker, GPT-6.1-Sol/high, delivered Windows native/controller
and PowerShell backend. `windows_calm_safety/turn1` and `windows_calm_compat/turn1`
covered the complete initial21-file delta. Safety passed; compatibility identified
stale inherited PATH after installing Java. `windows_environment_review/turn1`
reviewed `018eb47..b618f8cadbc94755872e16c2f5f10cccb0aa99a6`, identifying lost
precedence when a process explicitly reordered registered JDK paths.
`windows_environment_review/turn2` accepted the complete correction delta
`b618f8c..889e766`, both findings resolved and no new actionable findings.
All reviewers requested GPT-6.1-Sol/high; effective configuration/tokens unknown.
Unchanged initial coverage plus complete correction scopes cover the final source.
Ledger4launches/1initialwave/2targetedwaves/2fixbatches/0integrationwaves;
review wall clock1169seconds, not attributable worker or coordinator active time.
Weekly95% remaining at start is account allowance, not task cost.

Full npm247tests, installer8tests, corrected coordinator134net48/Mono assertions
(worker133 without the extra actual-ZIP comparison), portable PowerShell7 fake28,
configuration/links, kit source/license/mode parity and extracted Maven compilation
pass. Both net48 builds are warning/error free. Final unsigned AnyCPU EXE verifies
its exact embedded kit and managed PE header, built from clean reviewed source:

- `Zero-Setup-0.5.6-windows-development.exe`:295936bytes; SHA256
  `6e375bd0e3dec5cbf9518662cc33a97fd855a1811357816305458d8fd1ce8bd5`.
- Regenerated `zero-bootstrap.zip`:239274bytes; SHA256
  `121aefb26c6fecfddba0cdadba3070ab34ee48b11e8ab90ec493519d7afe421f`.

Identical Windows EXE copy in Downloads. Signed/notarized Mac0.5.5 and its original
kit/VSIX/receipt are preserved; Mac Downloads hash unchanged. Ignored receipts:
`.verification/calm-windows-setup/{delivery,review-ledger,work-ledger}.json`,
test logs and `dist/installers/build-windows.json`. The portable PowerShell runtime
was downloaded only into an ignored test folder from the official release with
its published digest verified; it is not a host installation or PS5.1 proof.

Physical Windows UI/registry, PowerShell5.1, execution policy, actual vendor
installation, SmartScreen, restricted networks and novice flow remain untested.
Windows testing remains explicitly deferred. No push/PR/merge, publication,
deployment, signing, host repair, profile/account or credential changes.

## Superseding branch-policy decision

After approving [Zero PR20](https://github.com/codepetca/zero/pull/20) and
[Community PR5](https://github.com/codepetca/zero-community/pull/5), the owner
explicitly requested removal of GitHub branch protections. Both main protection
records were deleted; authenticated GET returned404 `Branch not protected` for
each repository and both ruleset lists were empty. Earlier protection receipts
below are historical. The JSON snapshots do not enforce or restore settings.
This decision changes GitHub enforcement only; Community acceptance-helper
requirements, CI, reviewed runtime source and published release bytes are unchanged.

This small tracked index survives a fresh checkout. Full logs, screenshots,
archives and caches stay ignored. AI source reviews below are independent local
code reviews, not authenticated GitHub human approvals.

## Published 2026-10-10

- [Zero 0.5.3](https://github.com/codepetca/zero/releases/tag/v0.5.3), source
  `c00e7a6d7e7d4bea9e14be821a1a75967fcf6d22` ([source PR17](https://github.com/codepetca/zero/pull/17)).
- [Community 0.1.3](https://github.com/codepetca/zero-community/releases/tag/v0.1.3), source
  `7d4fa181d07f320cc4a305f60636e81aab9a9bcb` ([source PR3](https://github.com/codepetca/zero-community/pull/3)).
- [Exact Zero preparation run38098090855](https://github.com/codepetca/zero/actions/runs/38098090855).
- [Community publication record PR4](https://github.com/codepetca/zero-community/pull/4),
  [catalog promotion PR18](https://github.com/codepetca/zero/pull/18),
  [download promotion PR19](https://github.com/codepetca/zero/pull/19).
- Post-publication Zero main `f8f78290e3fd6cc3cae9ddfde9d79534778b9c87`;
  Community main `f6460f48f6c3ba5ae1c842f40324b44f5dbfa712`.
  These are recorded delivery revisions, not moving branch aliases.
- [Live site](https://zero.codepet.ca/) and public downloads were read back;
  three Zero and nine Community files matched sealed/source-bound sizes/hashes.
  Eight older0.5.2/0.1.2 downloads retained their original hashes.
- Actual new-cache/empty-settings Maven gateway consumer passed native segmented
  health-bar checks; live browser Download Zero retrieved the measured ZIP.
- Public artifact source of truth: [kit manifest](../release/kit.json) and
  [Community manifest](../release/community.json). Published bytes are immutable.

## Independent source review coverage

| Review turn | Reviewed source/delta | Requested model/effort | Verdict |
| --- | --- | --- | --- |
| release_delta_review/1 | `79ec5d2..e678a013` release delta/contracts | GPT-6.1-Sol/medium | Complete, no blockers |
| release_delta_review/2 | `4e2eb8dac680578eeab1804106a55744fec77f5c` CI audio/README delta | GPT-6.1-Sol/medium | Complete, no blockers |
| release_delta_review/3 | `8caab0fdc4120c7f07b4cf2d988ceb8b0dc86e15` playback deadline delta | GPT-6.1-Sol/medium | Complete, no blockers |
| public_catalog_review/1 | Community docs `a97b98961310826020734e240565048fef4105f1`; catalog SHA256 `13986ffd8a2c656fb00f7975f9f848933584d9afaea419a8fa21c82033173e94` | GPT-6.1-Sol/high | Complete, no blockers |
| kit_download_metadata_review/1 | `9d465c377f86b83e2a380e20c1d6786623e6e671` two-file metadata | GPT-6-Luna/medium | Complete, no blockers |

Unchanged implementation coverage was reused from the integration/media/alternatives
reviews recorded in [historical verification](history/verification-through-2026-10-10.md).
Publication ledger:6launch attempts,5successful review turns,1initial wave,
3targeted waves,1integration wave,2fix batches. One unavailable model request
fell back once to supported GPT-6-Luna. Effective configurations and attributable
tokens are unknown; account weekly allowance25%to24%does not measure task cost.

## Verification and limits

144extension/kit tests,24site tests/types/build; Linux native examples under Xvfb
and a PulseAudio null sink; two reproducible Community builds,6JavaFX checks and
4actual consumers. Synthetic macOS actions and virtual Linux CI do not establish
physical classroom behaviour. Windows/Linux editor/setup, physical typing/choosers,
audible output, school restrictions and novice trials remain unverified.
No live AI provider or independent public Community acceptance is claimed.

Full local receipts: ignored `.verification/publication-2026-10-10/receipt.json`
and `DELIVERY.md`. Their absence on a fresh checkout does not erase this index.
CI artifact retention is14days; public releases/manifests remain the durable
artifact references. Never infer a still-valid authorization from old evidence.

## AI workflow audit and remediation

Audit at Zero `f8f78290` / Community `f6460f48`:43release tests and48Community
boundary tests passed. Reproduced no-op workflow trust, mismatched outbound-byte
budget, and boolean schema acceptance. Remediation passes39admission and25acceptance/release regression tests. Zero
43release tests,24site tests, types/build and configuration/link checks pass. Source
remains local after completed independent review; no new release or live provider.

## GitHub main protection — 2026-10-10

Owner authorized enforcement after the audit. Authenticated API readback confirms
1current human approval, stale-approval dismissal and latest-push approval by
another human, strict up-to-date GitHub Actions `review` from app15368,
resolved conversations, admin enforcement and no review bypass/force push/deletion.
The settings snapshot is [main-protection.json](../.github/main-protection.json).
Named [CODEOWNERS](../.github/CODEOWNERS) is local until its human-reviewed merge.
Readback JSON is retained locally in Zero .verification/ai-flow-hardening-2026-10-10.
Initial API request was rejected422 with both contexts/checks; corrected checks-only
request applied successfully. No account identity, credentials or release bytes changed.

## Independent remediation review — initial wave

`ai_hardening_security_review/turn1` (correctness) reviewed Community `f6460f48..a120d2cb` and Zero rules at
`49385146`; `ai_hardening_compat_review/turn1` reviewed both complete `f8f78290..49385146` and
`f6460f48..a120d2cb` diffs. Requested GPT-6.1-Sol/high in two fresh contexts;
effective configuration/tokens/elapsed telemetry unknown. Both assigned scopes
complete. Accepted two P2 corrections: final PR/review/role readback and accurate
publisher stop/resume documentation. First correction batch passes25acceptance
regressions (15.202seconds), retaining39admission tests and unchanged source digest.
Targeted independent review completed for both correction deltas. Main protection
was absent (authenticated404 `Branch not protected`, repository rulesets empty)
before applying the stronger gate; the apply script rechecked that baseline.

## Accepted local hardening delivery

`ai_hardening_security_review/turn2` covered Community `a120d2cb..6be28609fae074b1e0d8b51d142b8e1c5a4b842b`
and Zero `49385146..1d37a70276843a695a5a83fc0ebdbf5cbf92d79b`, requested
GPT-6.1-Sol/high. Complete correction scope, both accepted P2 findings resolved,
no new blockers; five focused race cases passed in2.173seconds. Initial unchanged
policy/AI and compatibility coverage remains applicable; no extra integration wave.

Final checks:39admission,25acceptance/release,43Zero release and24site tests pass;
Zero configuration/links/types/production build pass. Current CLI emits33,875UTF-8
request bytes, no provider call; library source digest unchanged. GitHub protection
was read back again after review, matching the intended gate. Histories match the
original revisions except archive headers/rebased links. Primary funding work untouched.

Review ledger:2initial turns+1targeted turn,1fix batch,0failed reviewer launches;
effective models/attributable tokens/worker elapsed telemetry unknown. Conservative
review budget clock01:06:06–01:12:04UTC (~6minutes), not measured worker/coordination
cost. Implementation worker estimated12minutes+4minutes correction; those estimates
are not a claim of savings. No source push/PR/merge, new release or live AI provider.
Final receipt-only state edits are coordinator-checked; runtime source is unchanged
from the reviewed revisions. Code-owner file selection takes effect after human merge.

## Lesson 12 source delivery

[PR21](https://github.com/codepetca/zero/pull/21) adds five runnable teaching stages,
including the complete platformer. Owner authorized source publication and merge;
this does not create a new kit release. Implementation `8c9896d53bc3ea2674b640c907a3184555383142`
was independently reviewed by `lesson12_review/turn1`, GPT-6.1-Sol/high, complete
46-file scope with no blockers. Receipt-only head `944ddfe` passed
[Actions38101600157](https://github.com/codepetca/zero/actions/runs/38101600157).
Main integration at `1f2fd53` affects documentation only; current final-head checks
and actual merge status must be recovered from PR21. See [verification](VERIFICATION.md)
and the [phase archive](history/lesson12-through-2026-10-10.md) for scope and limits.
No published artifact version or sealed bytes changed.

## Guided student setup — local 0.5.4

Feature base `cbd12ad1b67252f6c4c33fbbe22aa40052eb0791` already contains merged
Lesson12 PR21. Setup implementation `80327897619ba89db07eeacdf220ef9910defd41`;
corrected runtime `61025bf09b633921a09e32b099754633dde4855e`. Local kit/extension
0.5.4, core0.1.1; public0.5.3 bytes and Community remain unchanged.
No push, PR, merge, release, deployment, host installs or account changes.

Accepted workers: guided_setup_launcher GPT-6.1-Sol/high (setup launchers),
guided_setup_editor GPT-6.1-Sol/medium (native checklist/repair). Root verified
packaging/integration. Editor valid-project-switch recheck was corrected before
initial review. Initial base was briefly misidentified as1f2fd53; both reviewers
acknowledged the actual base during their original turns, without relaunches.

Independent guided_setup_security_review/turn1 and guided_setup_compat_review/turn1,
GPT-6.1-Sol/high, completed the feature diff and execution/packaging callers at8032789.
Accepted two unique P2 findings (wrapper execute permission and task-environment
uncertainty), including one duplicate. One runtime correction batch addressed both.
guided_setup_security_review/turn2 completed the six-file correction delta at61025bf:
no new blockers, independent fake-UI proof confirms changed terminal environment
blocks the pre-Run handoff. Unchanged compatibility coverage remains applicable;
no extra integration wave. Final README wording follows the nonblocking review
correction; receipt/text-only edits are coordinator-checked, runtime unchanged.

178 full tests passed before correction (127.901seconds); 46 affected tests pass
on corrected runtime (0.171seconds). Launcher12 (8.594seconds), release43, kit3,
configuration/links and regenerated extracted-kit checks passed. See verification.
Ignored receipt/logs: .verification/guided-setup-2026-10-10. Requested/effective
models distinguished; effective models, tokens and worker elapsed telemetry unknown.
Review ledger:3turns,1initial wave,1targeted wave,0failed launches,1runtime fix batch
plus final nonfunctional wording/receipt cleanup. Conservative budget counts2batches.
Review-session clock began02:15:17UTC on2026-10-11; end in ignored receipt. Weekly22%
remaining at start is account-wide, not project cost; no savings claim. Native
Windows/Linux, real installers, school policy and novice usability remain unverified.

## Setup compatibility and repair follow-up — local only

Base `080d7a4c7f69dff12fb1efd2aabb81998f833f0e`; implementation
`e2fad4beb4ae83813bd2e4a5fe22def7677d5f38`; corrected runtime
`a6078beb91bf8210e8c9ded4ac5467363eaefe64`. New setup metadata derives VS Code
compatibility from extension engines; compatible selected tools are retained,
known stable locations checked, selected paths reported and managed repair uses
explicit fixed install/upgrade commands. Native installer wrapping is planned in
[INSTALLER.md](INSTALLER.md), not delivered. Core/editor runtime unchanged.

setup_compatibility GPT-6.1-Sol/high delivered setup scripts/tests; root accepted
metadata/docs/integration. Worker estimate10–12minutes plus4minutes correction,
not measured total cost. Four initial fake-brew test failures were test regex
anchoring, corrected before independent review. Actual per-turn tokens/effective
models and attributable coordination time unknown. Weekly21% remaining at start
is account-wide, not this feature's consumption; no savings claim.

setup_reliability_security/turn1 and setup_reliability_compatibility/turn1 requested
GPT-6.1-Sol/high, completed all9files at e2fad4b and relevant execution/packaging
callers. One aggregated P2: named Homebrew outdated status1 rejects available
updates, plus explicit auto-update-cask inventory semantics. Both independent
proofs and coordinator reading of installed official source validated it. One
correction batch uses unnamed per-kind inventory and exact package-name matching.
setup_reliability_compatibility/turn2 accepted the complete two-file correction
delta at a6078be with no new blockers. Genuine query errors still stop repair.
Prior unchanged coverage applies; no extra integration wave. Final receipt-only
edits are coordinator-checked, runtime unchanged.

Ledger3turns/1initial wave/1targeted wave/1fix batch/0failed launches. Conservative
review clock02:42:40–02:48:00UTC on2026-10-11,320seconds; worker elapsed telemetry
unknown. 27initial launcher tests (20.367seconds),34corrected cases (28.067seconds),
4kit checks (4.019seconds), configuration and final regenerated ZIP checks pass.
Full logs and measured final artifacts in ignored .verification/setup-reliability-2026-10-10
and dist/release.json. No push/PR/merge/release/deploy, host installs or account
changes. Primary funding work preserved; public0.5.3 and Community unchanged.


## Native setup delivery — local only

Base d0311ea1827769110adbe86b5a66db83b85ed113; implementation d9c79ba8d8b0939be1df2c3256853423d7512db2;
accepted runtime b3551bec3b0cb856b386876d0aebf9553d5035f0. Mac AppKit/DMG and
Windows WinForms/net48 AnyCPU wrappers embed the measured complete kit, preserve
fresh-folder boundaries and retain explicit guided repair/account separation.

installer_macos and installer_windows requested GPT-6.1-Sol/high, one writer per
platform. Mac worker estimated15minutes, Windows15–20minutes; correction effort
and effective models/tokens unknown. Coordinator owned build/verification/docs.
Two initial build attempts exposed host lipo multi-architecture verify parsing;
one-architecture-per-call fixed it before review. Four build attempts total,
two failed; final corrected artifacts bind clean b3551be. These estimates and
account-wide20% weekly remaining at phase start do not establish task cost/savings.

native_setup_security_review/turn1 completed24-file initial scope at d9c79ba:
2accepted P2s (unbounded detached output drain, bundled versus copied recheck).
native_setup_compatibility_review/turn1 completed24-file scope:1accepted P2
(normal close before asynchronous cleanup). One corrective batch addressed all;
Windows worker also confirmed old incomplete-capture exit0 through a failing
fake-process assertion, then fixed the same readiness invariant. No rejected
findings or failed launches. native_setup_security_review/turn2 completed all
12 correction files and immediate lifecycle/copy/probe/package boundaries at
b3551be:0new findings/blockers. Unchanged initial coverage retained; no extra
integration wave needed. Final nonfunctional receipts coordinator-checked.

Ledger3turns/1initial wave/1targeted wave/1runtime fix batch. Review-session clock
03:04:31–03:14:05UTC on2026-10-11,574seconds; attributable coordinator/reviewer
active time unknown. Full receipt and
artifacts in ignored .verification/native-installer and dist/installers.
56Mac assertions/52Mono checks/3packaging tests, config/links, exact kit/Maven
and final read-only DMG/PE payload checks pass. See VERIFICATION.md for hashes
and precise gaps. Physical Windows, actual installations and distribution signing
remain pending. No push/PR/merge/release/deploy, tool/profile/account mutations or
security-policy changes. Primary funding work and Community preserved.


## Mac-first setup correction and dogfood — local only

Owner deferred Windows testing. Base9917502b5c349863a3ad12b1bdabdf3667f536a2;
reviewed runtime4b7058c46a0c2f633329c8f5222a25f5376e7623. Live AppKit checking
revealed inherited child signal masks, confirmed by before/after Bash self-TERM.
installer_macos requested GPT-6.1-Sol/high corrected only SetupCore.swift/tests.swift;
coordinator handled actual UI, isolated editor testing, build and records.
62 harness assertions pass. Native check/picker/fresh copy/launcher startup and
6 real VS Code/JavaFX flow assertions pass, with precise interaction limits in
VERIFICATION.md. No teacher profile/tools/accounts were modified; only disposable
profile/extensions and instrumented starter were used. Original Main restored.

native_setup_security_review/mac-signals-turn1 requested GPT-6.1-Sol/high completed
the entire two-file9917502..4b7058c correction, process/controller/timer/output
boundaries;0findings/blockers. Ledger1turn/1initial wave/0targeted waves/0review
fix batches, no failed reviewer launches. No integration wave: code remained
unchanged after the complete clean review. Reviewer/coordination elapsed time,
effective model and per-turn tokens are unknown; weekly17% remaining at start is
account-wide allowance, not task cost. DeepSeek remains paused. Ignored ledger
and test receipts are in .verification/mac-first-run.

Mac-only source-clean build/verification receipt binds4b7058c. Previous all-platform
receipt archived because its Mac hash was superseded. No Windows runtime work,
push/PR/merge/release/deploy/signing access, system installation or OS-policy
change. Primary funding work and Community preserved. Final CURRENT/documentation
receipts are coordinator-owned, nonfunctional and locally checked.


## Apple Developer ID identity — 2026-10-11

Owner explicitly approved certificate issuance and login-Keychain import after
reviewing the prepared request. Apple issued Developer ID Application/G2 for the
verified Stewart Chan team. The public certificate matched the original CSR and
local private key; current-valid certificate dates and team/type were checked.
Private-key PEM import was initially rejected twice by macOS for its format;
conversion to PKCS1 encoding preserved the same RSA key and imported successfully.
Certificate import succeeded; security find-identity verified1valid signing identity.
Only codesign application access was granted; no allow-all key access or partition
list/password workaround was used. After verification, temporary plaintext key
copies were removed; the private key remains in login Keychain. Public certificate,
CSR and recovery state are outside Git; screenshot proof is ignored.

This was coordinator-owned account setup, not a code feature or release. No worker
or independent source review was needed; application code and build artifacts were
unchanged. No private key, credentials or signing secrets entered Git. No app
signing/notarization, API-key creation, publication or Windows testing occurred.


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

## Mac 0.5.6 alignment and student flow — 2026-10-11

Clean build source `7d8db9bead9bc61ed556810df5373cb2e14dde45`; Mac/runtime source
unchanged from reviewed 0.5.5. Both native candidates embed the same 239274-byte
0.5.6 kit, SHA256 `121aefb26c6fecfddba0cdadba3070ab34ee48b11e8ab90ec493519d7afe421f`.
Reused existing Developer ID identity and “Zero Notarization” Keychain profile.
Apple accepted `4ba0305b-a1de-4fc5-b4b1-4b7732e50a95`, no issues. Universal
ARM64/x86_64 signatures, hardened runtime/timestamps, all payload bytes/modes,
staple validation and Gatekeeper app/DMG acceptance passed. Final 691970-byte
`Zero-Setup-0.5.6-macos.dmg` SHA256
`4aba28b32da54fbd5fc8aa756dce4f33fbdc2fc02f6ad1c6089aff0bb088709d`.
Identical Downloads copy; prior 0.5.5 Downloads hash preserved.

After owner manual unlock, actual signed app copied a fresh folder with spaces;
all 126 files/modes match. Supported VS Code 1.141 profile-import UI created Zero
in owned disposable user-data. Background installation after explicit selection
added zero.zero 0.5.6 and redhat.java 1.56.0. Imported settings match; VS Code saves
the requested Default Light Modern as builtin Light Modern. Native readiness
passed. Open Zero displayed the minimal sidebar and first lesson. Sidebar Run
compiled and launched unchanged Main with JDK 17.0.14 and JavaFX 21.0.12; Stop
reported App stopped, disabled Stop and terminated both owned Java processes.
A finite subclass of unchanged Main separately verified Stage.isShowing and
“Hello, world!” label, then exited successfully. JavaFX is not exposed to CUA;
this is runtime evidence, not a visual observation. Removed temporary probe,
clean-compiled original four sources and rechecked all 126 files/modes.

The official signed VS Code app was cloned into the ignored test area to permit
exact-path UI control, with its signature verified unchanged. CLI wrapper and
supported import isolate all profile/extension actions; owner's editor remains
untouched. No internal profile storage manipulation. Test copy inside the Git
worktree correctly refuses repository connection; no Git/account/upload trial.
Owned setup/editor stopped, owned DMG ejected, local preview server stopped.

One read-only GPT-6.1-Sol/medium download worker verified public 0.5.3 ZIP/starter/
VSIX URLs and published hashes. Coordinator independently verified local 0.5.6
home/Learn pages and all three HTTP download bytes/hashes. Website offers no native
installer links yet; public 0.5.3 remains unchanged. No website source edits.
No new runtime review needed because runtime source is unchanged; prior independent
coverage retained. Approximately 25 minutes including manual unlock/UI work;
weekly 92% at start is account allowance. Effective model/task tokens/cost unknown.
Ignored source-bound receipts: `.verification/mac-056/` and
`dist/installers/build-macos-signed.json`. Configuration/diff checks passed.

Remaining limits: fresh-machine VS Code/JDK vendor installations, quarantined
browser first-open, physical Intel/macOS 12, restricted networks and novice
usability. Windows physical testing stays deferred; EXE remains unsigned.
No push, PR, merge, publication/deployment, new certificate, account/credential/
Keychain policy changes or security weakening. Primary funding work and Community
untouched. Local candidates only.

## Mac download and exact-byte release preparation — 2026-10-11

Reviewed base `1ef5ceb5a52ed956ca2c667852c7e8264af04f5f` → implementation
`779d856f24c37f303842b1a14a8bdc30dd5fb415`. Added strict optional native manifest
`release/installer.json`, independent local `setup-v0.5.6` lifecycle and a bounded,
receipt/source/kit-verified Mac download route. Landing remains two actions; both
landing and shared header open Learn's platform choice when Mac setup is available.
Mac primary and ZIP/starter/VSIX alternatives verified through actual CUA browser.
No unsigned Windows EXE offered. Existing three-asset kit publisher unchanged.

One fresh-context GPT-6.1-Sol/high implementation worker; coordinator found one
header-link integration correction before review. One independent GPT-6.1-Sol/high
complete review accepted the exact head with zero findings; inspected complete
diff/callers, independently verified clean source equivalence and actual DMG.
Review1launch/1initialwave/0targetedwaves/0remediationbatches; no redundant review.
Approximately12min delivery wall time; requested models/effort recorded, effective
model/task tokens/cost unknown. Weekly91% at start was account allowance.

Passed: configuration/diff, website typecheck/production build/30tests, candidate
source/sealing2tests, unchanged publisher43guardtests. Production HTTP on owned
ports3336–3338 verified exact DMG691970bytes/SHA256
`4aba28b32da54fbd5fc8aa756dce4f33fbdc2fc02f6ad1c6089aff0bb088709d` and all3kit
asset bytes/hashes. Disabled local flag and VERCEL=1 returned303 to Learn; unknown
Windows route404. New native tests cover malformed/version/public-URL provenance,
unsigned/dirty/rejected/unstapled receipts, kit/DMG tamper, bounds/symlink escape,
protected/untracked source drift and no-overwrite sealing.

Actual `npm run release:prepare:mac` ran after clean source commit and review.
Kit/source/archive/mode/MIT/VSIX/extracted Maven verification and actual signed
DMG payload, Developer ID signatures, staple and Gatekeeper checks passed.
Candidate `dist/candidates/mac-0.5.6-779d856f24c3/` contains exact original DMG and
three kit files, independent manifests/build receipt, candidate.json, SOURCE.txt,
NOTES.md and SHA256SUMS. All10checksum entries passed; baseline originals and
candidate copies compared equal. Built source7d8db9b and preparation source779d856
recorded separately; protected native/runtime/packaged source equivalent. No
regeneration, new signing or notarization upload. Candidate refuses existing
output. Local browser tab and all owned preview servers closed.

Ignored receipts/screenshot: `.verification/native-download/`. Existing public
0.5.3/Community0.1.3 assets, README download and primary funding work preserved.
Read-only GitHub checks found v0.5.6 and setup-v0.5.6 tags/releases absent at
preparation time; recheck immediately before any later authorized publication.
No push, PR, merge, release/publication/deployment, account/credential/security
changes. Windows remains untested/deferred; fresh-Mac vendor/trust/quarantine,
physical Intel/macOS12, restricted networks and novice usability limits remain.

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
