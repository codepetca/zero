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
  historical `release/community.json` (retired). Published bytes are immutable.

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


## 2026-10-12 local generic hub build (integration pending)

Base ed71f4d; worktree kit-integration/zero on codex/app-game-tutorials. Three
bounded fresh-context implementation workers: Sol/high service, Sol/high checker,
Sol/medium website. Each owned separate paths; coordinator owned contract,
extension engine/actions, dogfood fixture, development/proof tooling and docs.
3 implementation launches, service one bounded hardening follow-up; no Git/file
ownership conflict. Requested configurations recorded; effective model, tokens,
cost and coordinator active time unknown. Account weekly remaining76% at start,
75% later; not attributable consumption. DeepSeek remained paused.

Evidence: .verification/hub-root-tests.log (252 passed); hub-website-tests.log
(47 passed), hub-website-types.log; website worker build passed. Service initial
actual disposable PostgreSQL suite15passed/0skipped; expanded17cases after complete
six-gate/current-policy-digest hardening await Docker recovery. Pure report3/3 and
checker validation3/3 passed. Trusted downloaded development project compiled and
opened/closed native JavaFX with actual label check under isolated Maven settings
and cache: hub-development-proof-fixed/native.log. First harness typo corrected
before passing rerun; this verifies the trusted scaffold, not arbitrary submission
acceptance or VS Code mouse interactions. Native canonical Starter UI PNG rendered
in hub-preview/preview.png; reused package's original Codepet MIT notice retained.

Docker actual compiler/AST/artifact/API and selected failure paths ran, but no
passing full widget check/isolation or integrated hub/Maven/browser flow yet.
JavaFX ARM64 requires newer GLIBC/native dependencies; corrected fixed Noble image
includes a trusted build-time finite readiness test. Near-full disk caused Docker
VM/containerd filesystem read-only during image build. Removed only npm download
cache and inactive old Zero vendor/editor binaries. Source/history/student files,
user data/receipts/artifacts, Docker.raw and all volumes preserved. Free data-volume
KiB rose1175124→2757500. Exact cleanup receipt: hub-disk-recovery.json. Docker write
probe still failed. Restart permission requested because unrelated local Pika/
Supabase containers run; no restart without reply. Source is ready for independent
review, not declared accepted/public/student-ready. No push/PR/merge/deploy/live
OAuth/credential/account changes or public component publication.


Hub initialsource review973daf1: Astra/highsecurity+Sol/higharchitecture completed
assignedcoverage, 2launches/1wave, 5acceptedblockers. Sourcefixbatch1: observerstate
closednamedJPMSmodule, identicalagent/launcheridentity, no blanketmethodhandle
exemption; fourattackgroups/normal-lambda/exit/halt cases in actualJDK17 stubs (14
boundedprocesscases) nowpass. Websiteproxyredirect/session, exactolderrelease
inspection, truegeneratedMIT License POM and lexedspaced/unicodeJava shadow checks
corrected. Coordinatoradditionally exposedcomponent source/preview in quietFiles
view and madeconcurrent-publisher test assertonepublication withoutassumingwhich
promise wins. Website49tests/types, extensionhub7 and sourceconfiguration pass.
ExpandedactualPostgreSQL run16/17: concurrentreturnorderingfixture corrected,
rerunpending. Root253run240pass13fail duringdiskfull ENOSPC, not a pass; rerunneeded.
Fullsourceacceptance andruntimeproof stillpending; no public action.

OwnerapprovedDockerrestart. Firstrestart/writeprobe succeeded and23existing
Pika/Supabaseservices returnedhealthy; Noblebuildagainfilled remainingdisk, so
buildstopped. InactivePlaywrightvendor downloadsremoved (9directories), preserving
active1208notificationresources/daemon/state/profiles; receipt ignored. Second
normalrestartstalled. Confirmedbackend noVMdiskhandle; gracefulTERM failed, only
stuckbackendKILL underrestartauthorization, followedbyofficialforce-stop/startCLI.
A separate activeFree Mac Disk Space taskhandlesbroadercleanup; no competition
withitsrepo/worktree/UVcleanup. AvailablefreeSpace subsequently~8GiB; notclaimed
asthis task'sreclamation. Dockeractualrecovery mustbeverifiedbeforeimagebuild.


Finalsource0bc6faa checks:254root,49website/types/build,17actualPostgreSQL,
6purechecker/report andactualJDKstub14boundedcases passed. Fullruntime remains
pending. Targetedsourcecorrectionreview and passive-defensive retry wereblocked
byproviderfilter(possiblecybersecurityrisk); 2failedlaunches counted, noaccepted
review oralternativeproviderattempt. Total4reviewlaunches/2targetedwaves.
Fixbatch2 moves statelessFXreadinessApplicationto separatequalified-exportpackage
withoutopeningobserverstate; stubcompilation includes statelesspackage andpasses.
Noblebase cachedJVM truncation confirmedin actualDockerbuildlog (libjvm.so filetoo
short afterpriorfulldisk). Only reclaimableunsharedcache records tiedto exactNoble
base selectedforprune/rebuild; no volumes/globalDockerdatareset. Source-review
60minclockstarts07:49; no additionalremediation/reviewerpast08:49withoutuser
extension. Allholds/productionlimitations stayexplicit.

2026-10-12 runtime/restart checkpoint, source d327fbe: fresh owned BuildKit
builder built the pinned Noble checker and passed its image-build readiness
probe. The default Docker runtime still exited 255 with an exec-format error;
six actual Docker tests failed at startup, and verify-hub failed before valid
publication. Extracting the loaded image's entrypoint showed zero bytes; its
bash binary was ARM64 ELF. Removed/reloaded only this task's generated checker
image from the fresh builder, with no improvement. Evidence remains ignored in
.verification/hub-runtime-recovery/, hub-docker-checks-final.log and
hub-integration-final.log. No image corruption repair or positive end-to-end
proof is claimed. The latest explicit Docker restart completed through
docker desktop restart --timeout 60; all 23 pre-existing services returned
running and all configured health checks became healthy. Stopped this task's
hub/website preview processes and disposable database. Browser local sign-in
was clicked and returned HTTP302, but authenticated UI was not observed;
interactive preparation/upload/download remains pending. No source edits or
additional reviewer launches after the elapsed review budget; no public action.


## 2026-10-12 resumed hub verification — local flow passed, review gap remains

Owner explicitly instructed “Override budget constraints and proceed.” Applied
personal override-task-stops to this coordinator's agreed local hub build;
workflow review/low-usage stops waived, cumulative counters retained. Provider
execution limits, paused DeepSeek, acceptance checks and no-public-action scope
remain. Latest code3b2f41a; all source writers stopped.

Docker recovered by removing only five task-generated checker images and their
reclaimable, unshared cache graph (including child references that kept truncated
base snapshots alive). All 23 existing services/volumes preserved. Fresh pinned
Temurin17/Noble base and trusted readiness built successfully. Final image
sha256:f82f24e1929bce3cc3c2c8ed69bc28a8fa3ca47ac6cd8b0a33e6712746bf437c,
policy digest295c8e3a08f6266a828a7e7b5263915da3c6ecefccaf954f23459a6dcd76c9e3.
First recovered Docker suite5/6 exposed a JDK address-class initialization blocked
by the completion guard. Trusted pre-initialization performs no network request
and does not relax candidate permissions. Final actual Docker suite6/6 passed,
122.69s; JDK stub proof14 bounded cases passed. Logs hub-docker-checks-fixed.log
and hub-jvm-recovery.log remain ignored.

Sol/high login/download worker (one new launch, bounded follow-ups) reproduced
three real Next issues that native tests missed: Request.url normalized localhost
and lost the 127.0.0.1 login cookie on absolute return redirect; ZIP Origin check
used that normalized hostname; dynamic asset URLs duplicated Unix launcher bytes
into Windows/properties files. Fixed root-relative approved redirects, strict
canonical Origin/direct Host validation ignoring forwarded authority, and literal
trusted asset URLs. Actual Next sign-in/session/logout and hostile-origin failures
verified; real ZIP files now equal canonical11790/8481/255 bytes. Added opt-in
actual HTTP regression, not a unit-only assertion. Production build HTTP test1/1
passed at3178. No real account/OAuth credentials or public submissions used.

Actual CUA browser trial with disposable PostgreSQL/local actor: sign-in -> reserve
ui1/ScoreDisplay -> download ZIP -> edit ordinary Java (label style) -> select
extracted folder -> upload -> all six gates passed -> locally listed -> inspect
import/API/exact Maven pin -> logout. Downloaded ZIP preserves executable mvnw;
its edited JavaFX preview compiled and passed a native Mac window/label/style
check. Source/artifacts/screenshots and ZIPs retained under ignored
hub-browser-recovery/. Browser trial uses a one-class editable scaffold; it does
not imply the separately composed three-class package is publicly published.
Owned preview processes/database/browser tab stopped; task-created downloads moved
out of Downloads into this evidence directory.

Full local hub proof passed in91.93s: failed compile -> corrected same unpublished
0.1.0 -> immutable0.1.0 and0.1.1 -> exact study/coin-game consumers at
0.1.0 ->0.1.1 ->0.1.0, actual loaded JAR/hash checks, extension's actual
Add/Update/Revert engine plans, preserved original metadata. Three-class package
contains StartScreen/Hud/ScoreDisplay. Receipt:
.verification/hub-integration-recovered/receipt.json. Separate actual production
Next gateway proof fetched the previously absent ui1 artifact and ran both native
apps; cached JAR SHA256776310da0cd8dcff09a6374b61d906d2b34fa633bc603b15770e24963b9c433a
matches the checked release. Receipt hub-proxy-integration/gateway-receipt.json.
All owned gateway servers/disposable database stopped.

Final root254/254 (210.27s), configuration/contracts/syntax/docs links passed.
Website51passed/1opt-in HTTP skipped by default, typecheck/build passed; HTTP test
ran separately and passed in production. Prior17actual PostgreSQL cases reused
for unchanged service; no need to rerun them solely for a newer timestamp.

Cumulative review ledger:7 reviewer turns/launches (2 initial complete, 3 failed
Astra correction attempts, 2 completed Sol compatibility turns),1 initial full
wave,5 targeted turns,4 code fix batches. Existing Astra/high passive checker
review still rejected by provider's possible-cybersecurity-risk filter atd6023c8;
no alternate-provider bypass or accepted corrected security review. Fresh Sol/high
compatibility reviewed973daf1->d6023c8,20focused tests, found one provenP2 Java
identifier-ignorable source-shadow case (trusted javac17 compiled to colliding
binary name). Fixed comparison normalization with source-preservation regression
at3b2f41a. Targeted independent compatibility review passed: complete assigned
coverage,21focused tests plus8scanner cases, no blockers; checker security was
explicitly excluded and remains incomplete. Earlier security/publisher coverage
at973daf1 cannot certify the changed checker. Tests/self-review do not substitute.

Four implementation launches total across this build; one writer per component,
no conflicts or recursive delegation. Requested model/effort documented; effective
model/effort, per-turn tokens/cost and active coordinator/reviewer seconds unknown.
Weekly remaining76% originally and72% when override resumed are account allowance,
not attributable task spend. No new goal/task/automation, push/PR/merge/deploy,
public artifact publication, account changes or primary funding edits.

Working local implementation, not accepted/public-ready until the missing
independent checker review is obtained through a permitted path. Hosted OAuth,
managed DB/storage/hardened workers/abuse operations are separate rollout work.
Physical Windows/Linux/Intel, manual installed-editor hub and novice/physical-input
flows remain untested. Native proofmacOS ARM64; container policyLinux ARM64.


Final student-facing polish7d279a4: use readable six-stage check labels while
retaining failed compiler/runtime details. Sol/high independent label-only delta
review3b2f41a->7d279a4 passed with complete assigned coverage,0findings; earlier
compatibility coverage reused. Actual browser search for Hud and expanded checks
passed against a freshly checked/listed three-class package. Screenshot
.verification/hub-final-ui/checked-hud.jpg. All owned servers/database/tab stopped.
Cumulative ledger now8reviewer turns/launches (2initial complete,3failed Astra,
3completed compatibility),6targeted turns,5code fix batches including UI polish.
Waiver still applies; missing checker-security review unchanged. Backend/checker/
Maven/native evidence at3b2f41a remains valid for unchanged code paths; label-only
website types/tests/build verified separately. No public action.


## Contributor attribution — 2026-10-12

Owner requested By@GitHubaccount/profilelink and asked whether zero-community is
still needed. Code621a140. Coordinator handled the coherent service/UI change;
contracts before clients, no schema migration or submitted credit field. Public
catalog/exact-version and owner-only job results derive contributor from immutable
submission owner joined to the remembered authenticated user. Authorized submit
refreshes login only after numeric owner check, even for duplicate source; current
credit can follow a rename without changing any stored release. Frontend validates
numeric ID/login and constructs only https://github.com/<login>; arbitrary supplied
profile URLs have no authority. Existing releases need no backfill. Library IDs,
imports and pinned artifacts do not change. New hub runtime needs no central
community contribution repo; existing legacy releases/Workshop/dogfood fixtures
still depend on zero-community. Archival/migration is recommendation only, not an
owner instruction or an action taken.

Actual PostgreSQL18/18 including rejected contributor fields, other-account denial,
rename/current-public-credit and immutable stored-manifest preservation passed.
Website52passed/1default opt-in HTTPskip, types/build passed; extension7/7passed.
Native Docker publication of the existing three-class fixture produced contributor
{githubId:'101',login:'zero-local-demo'}; actual CUA discovery showed By@ on all
three classes and DOM href=https://github.com/zero-local-demo. Local test identity,
not a live GitHub sign-in or verified real profile. Screenshot/proof in ignored
hub-contributor-final/; earlier browser proof in hub-contributor-browser/.

Independent standard-risk Sol/medium review51241fe->621a140 completed all8files
and immediate schema/auth/publication/proxy/extension paths;0findings/blockers,
21focused tests passed, unchanged-source evidence reused. Requested configrecorded,
effective config/tokens/exactelapsed unknown. Ninth cumulative reviewer turn; no
remediation or checker-source review attempted. That existing provider-blocked
checker-security gap remains. No push/PR/merge/deploy/publication/account changes,
community-repo alteration or primary-funding edits.

## ZeroHub consolidation — 2026-10-12

Owner approved one Zero repository, ZeroHub branding and `/hub`, removal of the old Community workflow without legacy compatibility, and retirement after verification. Source commit19eaad79835ee0f7c4a6f0e4499c6053bff60d1a; two tutorial sentence corrections3d21d0bf4d5c9ea1b2ea468670a61083ca8f91b6.

Moved maintained Starter UI and health-bar bundles into libraries/ with MIT notices and source provenance. Single-repo namespaces zero.starterui/zero.healthbars remain separate from assigned ZeroHub namespaces zero.uiN. Removed Workshop, old catalog/static Maven routes, legacy editor actions and component ZIP dependencies. Extracted surviving POM/scanner/process helpers unchanged. Website route /hub; auth returns /hub/prepare; backend /api/hub preserved.

Passing evidence: configuration/syntax/command/doclink checks;175 root tests;61 focused editor/process/release checks; website38pass2opt-in skips/types/build; actual productionHTTP2/2 (canonical wrapper bytes, /hub navigation and retired route404s);18 actual PostgreSQL cases; rebuilt ZIP/VSIX/extracted Maven compile. Retired tests covered only deleted behavior; scanner/version/edit and process checks remain.

Ignored native receipts: .verification/zerohub-starter-internal/receipt.json (18.37s; two reproducible builds, source/notices, checks, both real JAR consumers); zerohub-health-bars-final/receipt.json (6retained tests,2expected mutant failures,4native consumers/JAR origins); zerohub-internal-full/receipt.json (47.064s; failed/corrected same version, immutable0.1.0/0.1.1, actual extension Add/Update/Revert, both apps0.1.0→0.1.1→0.1.0 and artifact hashes). Existing pinned checker image/policy reused, unchanged.

Browser receipt .verification/zerohub-consolidation-browser/receipt.json records actual sign-in at /hub/prepare, reservationui2, ZIP download, edited-folder upload, automatic local listing, credit/profile, import/pin/check details and logout. Listed UI/screenshots overview.jpg and listed.jpg visually inspected. The downloaded edited preview ran on macOS (ZEROHUB_DOWNLOADED_PREVIEW_OK). Production Next Maven gateway proof zerohub-consolidation-proxy/receipt.json began without hub coordinates, resolved exact published JAR hash and ran native packaged-study/game. This is local fake publication with demo identity101/zero-local-demo, not hosted OAuth or public release.

Independent GPT-6.1 Sol/high consolidation review turn1 completed the full142path19eaad7diff with0P0/P1/P2 blockers. It confirmed nine helper functions byte-identical, exact packaged source, removed dependencies/routes, source/license/proof consistency and unchanged Origin/cookie/session/CSRF bounds. TwoP3 wording nits fixed together; turn2 reviewed19eaad7→3d21d0b and closed both with no new findings. Prior unchanged coverage retained; no redundant review wave. Cumulative hub/contributor/consolidation reviewer turns11 (including3earlier provider-filter failures); consolidation2turns,1small docs correction, no implementation rework or writer conflict. Two new bounded source workers Sol/high (libraries, website), coordinator integration/browser/Git. Effective runtime configuration, tokens/cost and coordinator active time unknown. Weekly remaining70% at phase start is account-wide, not task cost.

Remote retirement: gh repo delete codepetca/zero-community --yes succeeded; authenticated subsequent repository lookup returnedHTTP404. Complete21ref history verified in /Users/stew/.codex/archives/zero-community-20261012.bundle. Original local source checkouts retained solely as recovery material; no product dependency remains. Zero was not pushed, PR'd, merged or deployed. Primary funding changes untouched. Owned test browser/server/PostgreSQL resources stopped; all23existing Pika/Supabase containers remain running/healthy where configured. Storage guard301GBcached then322GBfresh healthy; no cleanup/restart/pruning.

Limits: generic checker-security source review still incomplete after earlier provider rejection; this consolidation review does not substitute or bypass it. Hosted OAuth/database/storage/worker provisioning and rollout remain separate. Physical Windows/Linux/Intel, novice/manual installed-editor flows untested. No installer rebuild/signing/publication in this phase.

## ZeroHub Vercel/Neon preparation — 2026-10-12

Owner authorized public hosting and chose Neon through Vercel Marketplace, with no separate Neon login. Free resource zerohub (store_7SDARpYdaZmRY4z3, iad1, Neon Auth disabled) provisioned through the existing Zero Vercel project. Separate Neon CLI authentication was cancelled; its earlier input question is obsolete. Administrator integration variables moved to development only.

Source5437ee287ac85e3e74b7b5ee9cb26ec36fe5d159 separates HTTP/migration/checker/publisher processes, restricts SQL groups and adds immutable PostgreSQL byte storage plus a read-only Vercel adapter. Astra/high permission and Sol/high compatibility reviews covered the complete new hosting delta and callers. Their single deduplicated blocker concerned unexpected inherited/settable roles and direct LOGIN grants. Correction72598039d768a6b5ae0fd56f3ba137e99a7cb630 rejects extra memberships, delegation, elevated flags, direct ACLs and owned objects; only non-grantable current-database CONNECT is permitted. Both runtimes require direct Neon URLs. Targeted Astra/high review completed all9changed files/callers, resolved the blocker,0new findings; seven focused checks passed. Existing unchanged scope retained. Hosting ledger3turns/1initial wave/1targeted wave/1batch; cumulative14reviewer turns including prior failures. Effective runtime/model/token/time telemetry unavailable.

Coordinator verification:20actual PostgreSQL tests including related-role/direct-grant/ownership negatives passed; website43passes/2optional HTTPskips, types and production build passed; whitespace clean. Actual Neon PostgreSQL18 direct verify-full TLS connection confirmed the expected empty database. Installed reviewed schema, then SQL-created a NOINHERIT API login granted only hub_api and CONNECT. Runtime guard passed. Actual result/release/object INSERT checks returned permission denied; RESET ROLE retained no release-write/schema-create authority. An initial verification probe used an invalid UUID literal and hit type parsing before permission checking; corrected NULL probes passed. No student/candidate records or published releases were created.

Vercel production readback lists exactly ZERO_HUB_API_DATABASE_URL (restricted sensitive direct login), ZERO_HUB_EMBEDDED and ZERO_HUB_ORIGIN. No administrator/password integration variables remain in production. Private migration/runtime credentials and CLI logs are ignored with restricted filesystem permissions; no values recorded in source/output. No public deployment/PR/push yet. Catalog seeding/deployment remain pending. Uploads and untrusted checking remain closed; the earlier excluded checker-security gate is still incomplete. Primary funding work, existing Pika services and platform accounts outside this scope remain untouched.

## Public read-only ZeroHub — 2026-10-12

Owner-authorized first catalog stage is delivered at https://zero.codepet.ca/hub. Draft source PR https://github.com/codepetca/zero/pull/26; GitHub review CI passed for b0e7177686d68b9b4ce7ba039e0c062a0b3d2c74. No main merge or public student admission is claimed.

Maintained bootstrap797b502072751b94ca9020f649a1425592b667be uses fixed Starter UI, bounded native PNG, authenticated contributor identity, three independently verified restricted pools and exact submission/source-digest selectors. No arbitrary source/owner/checker/command arguments, listener, queue drain, migrations or public activation. Actual local proof passed compile/API/behavior/two consumers, preserved unrelated queued work, reused existing exact release and rejected changed preview; coordinator21PostgreSQL cases and5bootstrap unit passes/1optional skip passed. Sol/high integration review completed all6files and immediate callers with oneP2 github.com-host binding blocker. Correction b0e7177 explicitly pins gh --hostname github.com, with hostile-GH_HOST argv regression; targeted Sol/high review completed the3-file delta and closed the blocker,0new findings. Earlier unchanged authority/compatibility coverage retained. Hosting5review turns/1initial wave/2targeted waves/1integration/2fix batches; cumulative16reviewer turns. Effective model/token/time telemetry unknown.

Actual Neon SQL-created NOINHERIT checker/publisher logins verified against the previously reviewed role boundary, without adding them to Vercel production. Local operator bootstrap checked only fixed maintained source and published ui1:0.1.0 with StartScreen/Hud/ScoreDisplay, source-bound artifacts and contributor{githubId:'4050555',login:'armorup'}. All6gates passed on linux-arm64; native preview generated from maintained JavaFX source. Actual second bootstrap returned already-exists with all stored hashes verified. No untrusted queued candidate ran, no background workers or public auth/authoring opened.

Pre-upload Vercel dry run exposed ignored local verification files in default CLI inputs. No upload occurred. Added .vercelignore, then deployed only a Git archive of reviewed b0e7177; final dry408tracked paths/6,821,808bytes, zero private/credential/cache inputs. Existing Vercel root website/ and pinned pg bundle retained. Deployment dpl_5ZCSuaG1w3XZWL4D2PjrigEBSATJ / https://zero-oakbnisdb-stewarts-projects-cc2722c4.vercel.app becameREADY; authenticated candidate catalog verified before promotion. Canonical zero.codepet.ca promoted successfully. Generated deployment URL retains normal Vercel protection; canonical catalog is anonymous/public. No global protection was disabled.

Anonymous production checks: catalog200/production/one exact library/uploadsfalse/correct credit; JAR/POM/sources/preview exact size/SHA256 plus bodylessHEAD; session anonymous/no cookie; auth/reserve/submit/logout503/no cookie; Hub/learning/lesson200 and retiredCommunity404. Browser search reduced cards to Hud; expanded exact POM repository/dependency/import/API and six readable check labels; profile href github.com/armorup, real image loaded, search restored. Screenshots inspected in ignored zerohub-hosting/public-hub.jpg, public-hud.jpg and public-hud-details.jpg. Public browser retained; owned local Next port3107 stopped.

Empty-settings Maven proof started without cached hub coordinates, downloaded the public exact library and ran packaged-study3.83s/packaged-game2.80s (finite synthetic actions). Actual cached JAR SHA256776310da0cd8dcff09a6374b61d906d2b34fa633bc603b15770e24963b9c433a matches public catalog. Receipts .verification/zerohub-hosting/public-http-receipt.json and .verification/zerohub-public-consumers/receipt.json; native log retained. Website43pass2optional skips/types/build and root configuration/doclink checks passed. Storage322GBfresh healthy; no cleanup/prune/restart. Primary funding work and Pika services untouched.

Limit: public contribution service is unfinished. Earlier provider-rejected checker-security review is not satisfied by maintained-source checks or hosting reviews. GitHub OAuth, isolated hosted generic workers and quotas/backups/monitoring/removal remain gates before uploads. No new installer/kit publication. Physical Windows/Linux/Intel/novice flows remain untested; LinuxARM64 virtual-display checks and Mac finite consumers establish only the stated platforms/actions.

Availability documentation follow-up28f6e589bb7eb443330025de4fbbd9e782dd9b47 changes9docs files only; application code unchanged. Requested GPT-6Luna/medium independent reviewer completed the complete delta, checked both allowed public receipts and found0blockers. It did not inspect unchanged application code or independently probe the live site. Hosting review turn6 / targetedwave3 / batch3; cumulative reviewer turns17. Root doclink/configuration and43website cases/2optional skips passed; GitHub CI run38284880270 passed for28f6e58. Current public kits use manual card POM/import instructions; new sidebar Add/Update/Revert is clearly local/unreleased, and lesson11 uses the configured local sharing preview.

Clean tracked28f6e58 snapshot408paths excludes private/cache inputs. Vercel dpl_EYggD2cbHDqFXpt1Jhto9uY3eMox / zero-cdhilqnp4-stewarts-projects-cc2722c4.vercel.app becameREADY and was promoted to zero.codepet.ca. Coordinator actual unauthenticated /docs/components and /tutorials/11 responses verified the corrected public/closed availability wording; catalog remains production/ui1/armorup/uploadsfalse. Receipt .verification/zerohub-hosting/public-docs-receipt.json. PR26 remains draft/unmerged; first read-only public stage complete, full contribution goal unfinished. Final receipt-only checkpoint is not an application deployment change.


## Public contribution goal: admission and authentication housekeeping (2026-10-12)

The owner requested a persistent coordinator goal for the complete production student contribution journey. It is active and unfinished; phase exits are in ZEROHUB-HOSTING.md. Work started from2964636 in the existing integration worktree. Primary funding work, production configuration, public uploads and the generic checker source are untouched.

GPT6.1Sol/high delivered admission limits in19:00:51–19:07:19UTC (about6m28s); coordinator inspected the actual delta. A fixture timestamp update was correctly rejected and replaced with dated historical inserts; final31/31 service/admission tests passed. Coordinator added expired-authentication housekeeping. Its initial FOR UPDATE query was denied under hub_api; advisory serialization fixed it without expanded grants. Final3/3 actual-role cleanup,7 staging/embedded-runtime, root/diff checks passed. Five bootstrap units passed with1 optional Docker skip. No submitted Java was executed. Disposable fixtures were removed; Pika services were preserved.

Admission counts failed/published source history and preserves ownership/idempotency. Its logical JSONB budgets do not cover result/artifact/object/database/authentication storage. Cleanup is bounded, operator-only and unscheduled, with counts-only output. No hosted cleanup, account credentials, worker activation or deployment occurred.

Astra/high correctness and Sol/high compatibility completed the full2964636→3eb6247 delta with no code blockers. Sol's nonblocking P3 command-path finding was corrected at7ced199 and closed by targeted review. Phase ledger:3 reviewer turns,2 initial plus1 targeted,1 fix batch. Source reviews reused reported actual tests without inspecting private logs or assessing generic execution. Source7ced199 was pushed to draft PR26 and passed CI38296142064. No merge or activation. Earlier17 cumulative turns remain preserved.

## Local OAuth prerequisite and continuous checks (2026-10-12)

Starting at7ced199, Sol/high delivered OAuth hardening at19:17:59UTC with two self-review tightenings and no test failures. Coordinator inspected module/controller/test changes. Existing random browser binding supplies the S256 verifier, with matching one-time hashed state and no schema migration. Token/profile JSON caps are16/64KiB; each15-second deadline covers response headers/body. Callbacks clear the temporary OAuth cookie and preserve the separate session cookie; failed/cancelled attempts preserve existing valid sessions. Providers were controlled test responses, never real GitHub calls.

Final checks:37 actual PostgreSQL service/admission/OAuth passes,7 provider units,3 staging,4 embedded-runtime, root/diff checks. The fixture was removed; Pika services were untouched. Coordinator added backend prerequisites to release CI with locked dependencies and disposable databases. No account, database, host or production operations occurred.

Astra/high correctness and Sol/high compatibility independently reviewed the full7ced199→ef03b13 delta with no actionable findings. Sol additionally ran26 provider/website tests and pure cookie-proxy probes. Both exclude generic Java execution/security acceptance, real OAuth, browser HTTPS and hosted activation. The existing proxy's15-second total timeout versus sequential provider deadlines remains integration proof. Sourceef03b13 was pushed to draft PR26; CI38297309531 passed for ef03b13 (job114971404092,4m3s), including the new backend step, JavaFX, website and packaging checks. Existing pinned Actions emitted deprecation notices; no unrelated action upgrade was made. OAuth ledger:2 initial turns,0 fix batches. Earlier3 admission plus17 historical turns remain preserved:22 cumulative, including3 old provider-filter failures. Requested configurations recorded; effective configuration, tokens, cost and exact review elapsed times unknown. Shared starting weekly67% remaining/storage323.5GB readings do not measure task cost. DeepSeek remains paused. No equivalent rejected checker review was retried.


Coordinator checkpoint: goal tool reported573250 aggregate tokens and1741 elapsed seconds at19:28UTC; input/output/cache and worker attribution were not exposed. Account weekly remaining changed67%→66% across this work, a shared reading rather than isolated cost. No savings or dollar estimate is inferred. Final handoff edits are receipts/phase status only; application code remains reviewed CI-passing ef03b13.


## Embedded authoring adapter and authentication-record budgets (2026-10-12)

Continuation of the same public contribution goal; previous turn classified progress (reviewed source, tests and CI). Starting sourcead04273. Sol/high writer delivered the bounded website adapter,15 focused tests and catch-all route only. Coordinator added transaction-serialized state/session budgets, same-browser successful session rotation, cleanup lock coordination, actual-role bridge proof and CI invocation. Existing primary funding work/public deployment/credentials remain untouched.

Coordinator required three pre-review integration corrections: canonical enabled origin before cookie dispatch, prefixed Neon admin alias refusal and real64KiB streamed Maven bytes to honor Vercel's buffered4.5MB limit while preserving the16MiB stored-object contract. Worker delivered them; actual hosted streaming still unverified. One earlier worker fixture adjustment matched authentication count columns. Exact worker elapsed/effective model/tokens/cost unknown.

Checks43 actual PostgreSQL service/admission/auth passes,3 cleanup passes,3 Web/Node bridge passes against an actual restricted login/fake provider,58 website passes/2 optional HTTP skips (15 adapter focused included), types/build, root/diff checks. Coordinator bridge fixture initially passed an unsplit auth/start path and expected503; corrected to actual route segments. No source implementation failure observed. All owned fixtures removed; Pika services untouched. No real GitHub, candidate Java execution, publication, migrations/host provisioning or activation.

Separate phase source reviews planned: Astra/high correctness and Sol/high compatibility,2 initial turns/0 fix batches, default7launch/4fix bounds. Earlier22 cumulative reviewer turns preserved, including3 older provider-filter failures. Excluded checker acceptance remains held; new bridge review cannot substitute for it. Starting account weekly66% remaining and cached323.4GB healthy storage are shared readings, not isolated cost.


Pre-review coordinator correction: a documentation script accidentally copied CURRENT over VERIFICATION. Full diff inspection caught the lost history before any push/reviewer launch; the exact ad04273 verification history was restored and only the new proof appended. The local phase commit was amended before sealing. No production or student state changed.


Embedded phase review: Astra/high authority and Sol/high compatibility completed the fullad04273→d48abf2 scope. Astra independently passed15 adapter cases with no findings. Sol passed34 focused cases and reproduced a P2: GitHub's documented error_uri caused rejection before cancellation cleanup. Coordinator corrected the bounded ignored parameter and added fake/actual-role regressions. At11d7c5e,15 adapter plus4 actual-role bridge cases passed; targeted Sol/high reviewed the complete correction and independently reran15 adapter cases, closing the P2. No remaining findings in assigned local scope. Phase ledger3reviewerturns,2initial+1targeted,1fixbatch; cumulative25preserves earlier22. Requested configurations recorded; effective configuration/tokens/cost/time unknown. Source11d7c5e pushed to draftPR26, CI38300981955 passed, including backend, JavaFX, website and packaging checks. No merge/deployment/activation or old checker review.


Closed-download parity correction fcd5f631331048834447aaa1ad5dbb66253593a1 fixes the old read-only4MiB cap: a shared helper streams verified Maven objects up to16MiB through64KiB chunks whether uploads are0 or1. JSON4MiB, preview256KiB, HEAD bounds and closed cookie behavior retained. Worker59 website passes/2 optional skips,20 focused cases, types/build/diff passed. Independent Sol/high targeted review turn hub_adapter_compat_review/stream completed11d7→fcd5,0 actionable defects;35 focused tests plus6 closed-mode actual createHub/storage probes with fake SQL verified16MiB hash/length, HEAD, corruption and mismatched/excessive lengths. No new PG fixture or hosted proof. Phase4reviewerturns/2initial+2targeted/2fixbatches; cumulative26 retains3 historical provider-filter failures. Effective model/tokens/cost/time unknown. Source pushed; CI38302470684 passed forfcd5f63, including backend, JavaFX, website and packaging checks. No merge/deploy/auth/worker activation.


Operating controls089da50/abb529f: coordinator replaced artifact catalog scans with one exact library/version query and a filename/coordinate parser. Existing immutable storage verification remains. Actual PostgreSQL service/admission suite44passes covers older versions, all3Maven kinds andpreview, SHA1/SHA256, GET/HEAD/cache, malformed routes with zeroSQL and missing versions with exactly onequery. Seventeen parser/adapter cases passed. Sol/high worker delivered3polling files with9fake-clock/fetch cases and typecheck, no further builds after shared-cache coordination. Root independently reran9cases and included parser checks inCI. One budget perjob/account,5minutes/25automatic attempts,2→15second backoff,15second fetch/body deadline; hidden/offline cancellation, stale suppression, terminal stop and manualretry tested. Requested Sol/high compatibility reviewer completed sealedfcd5→abb9-file delta,0findings,11isolated checks; reused44PG/17adapter/type evidence. No moving-source tests or fixtures. Actual review turn5/cumulative27 includes older3filter failures; effective tokens/model/cost/review seconds unknown. Sourceabb529f pushed; CI38303525610 passed. Parallel discovery writer owns different paths; allGit mutations remain coordinator-only. Public deployment/source/credentials/worker holds unchanged.


## Bounded operating controls and discovery — 2026-10-12

Sources089da50/abb529f implement exact artifact lookup and bounded status polling; complete9-file Sol/high review found0defects and independently passed11 isolated parser/poll tests. CI38303525610 passed. Discovery writer Sol/high based089da50 delivered14 owned files, coordinator addedCI and one maintained-proof history assertion. Self-corrections: SQL quotes/parameter typing andTypeScript cursor/null inference. No writer conflict, production operation or candidate execution.44 existing PostgreSQL plus5 new restricted PostgreSQL cases passed, with27libraries/54releases;15 focused catalog/discovery/editor cases and72 website cases/2optional skips/types/build/root passed. Full16-file Sol/high review acceptedfa15c92 with0findings and15 independent focused passes; CI38304468383 passed.

Coordinator reproduced20 allowed64KiB API/changelog-note records producing2,622,823bytes against the old1MiB editor-page bound. Correction3b16089 byte-limits pages to2MiB with actual-returned-row cursors, permits nonempty shorter pages, and bounds editor traversal to500releases/16MiB/30seconds.17 focused cases and5 actual restricted PostgreSQL cases passed; website72pass/2optional skips/types/build/root checks passed. Root177 tests passed forfa15; focused delta tests cover byte changes without repeating unchanged native work. Complete4-file targeted Sol/high review accepted3b16089 with0blocking findings and17 independent focused passes. Newer review turn7, cumulative29 preserves3 older provider failures. Requested model/effort known; effective config/tokens/cost/review time unknown. Source pushed; CI38305503824 passed for3b16089. Default newer7-turn review ledger retained; the owner's earlier task-scoped workflow-budget waiver authorizes a further bounded receipt-doc pass, not bypassing source/execution/hosting gates.

Playwright local browser proof atfa15:23 inert administrator-seeded library manifests, real disposable PostgreSQL and loopback demo identity, checker/publisher disabled. Verified first20/Show more, search of library24 beyond the first page, oldui2:0.1.0 exact POM/import versus latest0.1.1, missing9.9.9 refusal and client navigation. Queued-only upload showed offline pause and five-minute stop:21 automatic requests from2.019to291.087seconds after submit, one later manual Refresh, no new request during the observed12.268seconds before logout; longer non-restart covered by fake-clock cases. Screenshots visually inspected: search.png, exact-old.png, poll-paused.png, poll-stopped.png under ignored .verification/hub-controls/output/playwright, receipt.json and counts retained. Initial today's-date seed exhausted the demo's daily quota; fixture recreated with dated historical inserts, with a SQL quote correction before restart. Initial receipt's15second assumption replaced by the actual12.3second observation. Product source unchanged by fixture corrections. Expected favicon/missing-version HTTP404s only; no runtime UI exception observed.

Owned Next3107, fixture15455/HTTP4117, catalog15457 and isolated browser stopped. Existing Pika services, public deliverable browser and primary funding work untouched. No real GitHub, hosted timing/streaming, candidate checks/publication, new installer/kit, schema/credentials/paid host/main merge or deployment. Goal remains active; missing checker acceptance and full operating/hosted journey gates persist.


Receipt checkpointffe0502 completed an independent Luna/medium4-file review with0actionable factual inconsistencies. Reviewer read only the allowed local UI receipt/counts, confirmed history and limits, and did not review unchanged code or execute tools against hosts. Actual newerturn8/cumulative30 includes historical provider failures; prior owner task-scoped budget waiver applied to this bounded docs pass only. Effective model/tokens/cost/time unknown. Source CI38305503824 passed for3b16089. Coordinator added this factual completion record; application code and public production remain unchanged. Latest receipt-only branch-head CI may run after push; full goal remains active.


## Public caching and free-operation constraint — 2026-10-12

Owner wants free website operation without traffic/compute upgrades. Existing Vercel team read-only API confirms active Hobby; current public Starter UI artifacts/preview total20804bytes. Proposed smaller library and total storage limits remain unapproved. No billing changes, paid provisioning or plan upgrades.

Sol/high writer delivered11ownedpaths from3ba9; coordinator sealedba999dc. Writer53focused,77website passes/2optionalHTTPskips/types/build; coordinator18focused independently passed. Astra/high privacy and Sol/high compatibility reviewed the complete11-file delta. One P2: normal node:http Keep-Alive header disqualified supported proxy caching. Correction8dec22b accepts the benign transport header and realistic metadata/object/private fixtures, and clarifies best-effort caching/withdrawal. Both targeted reviewers accepted complete2-file correction with0findings. Astra independently ran5cache cases plus13negative privacy combinations; Sol ran38initial focused and5correction cases. Four newreview turns/2initial+2targeted/1fixbatch, cumulative34 including3historical provider-filter failures. Earlier owner workflow-budget waiver remains distinct from checker/source/hosting authorization. Requested Sol/Astra high known; effective config/tokens/cost/time unknown. Starting account weekly63%remaining and cached322GBhealthy storage are shared readings, not attributable cost; DeepSeek stays paused. No writer conflict.

Coordinator final5cache cases/build passed; /hub is static and API remains dynamic. Local production browser proof at8dec22b used actual current read-only Node handler, fake SQL and maintained public metadata/PNG only. Exactui1:0.1.0/POM details, client navigation to latest and no-match search passed; screenshot visually inspected. Seven local GET/HEAD probes confirm public metadata60s/object3600s and private/error no-store policy. First proxy attempt against old deployed code rejected newer exact query400; current local fixture corrected proof configuration. Receipt .verification/hub-controls/cache-static-receipt.json, screenshot output/playwright/cache-static-exact.png. No hosted CDN HIT/expiry or cost-savings claim. Next3108, fixtureHTTP4118 and browser stopped; prior services/public deliverable/primary funding work untouched. No database writes, auth, Java execution, deployment/merge, new kit/installer or credentials. Full contribution goal remains active; old checker acceptance still held.


## Finite worker lifecycle — 2026-10-12

Cache checkpoint CI38309382997 passed for6198f73; public deployment unchanged. New source72576da makes Node workers default to finite batches, exiting empty or after10 processed jobs; explicit continuous mode retains old polling. Configurable1–100 is a per-invocation technical cap, not a global submission quota or clock guarantee. No role/activation/checker engine changes. Nine initial staging/unit cases and7 final lifecycle cases passed; actual restricted PostgreSQL17 accounts proved empty checker/publisher exit with0 retained connections and inert invalid-source retry stopping at2 attempts, no Java execution. Owned fixture15463 stopped. Source adds serialized lifecycle suite to existing PostgreSQL CI harness. Independent Sol/high complete4-file review found0findings,6 purecases passed/1 actual-PG case deliberately skipped while reusing root actual proof. One newreviewturn/cumulative35 including earlier3 provider failures,0fixes; effective model/tokens/cost/time unknown. Physical signals/180second shutdown, hosted trigger/concurrency and Neon18 lifecycle timing untested. No worker/deployment/credentials/host changes; generic checker acceptance remains held. Backup writer is independent/new-file-only and its moving code is not yet accepted. Fresh318GB healthy storage/weekly62%remaining are shared readings, not task cost.


## Private backup/restore prerequisites — 2026-10-12

Lifecycle CI38310573906 passed fordfc61f6; cache CI38309382997 passed earlier. Sol/high writer from6198 delivered4newbackupfiles,15PG17 cases including11actualsubtests, fixed fixture-only Mac /var path, trigger enablement/function ownership fingerprint and pre-transfer row-width bound. No source conflict. Coordinator found end sequence outside digest; worker correction includes trailer payload, BigInt ID floor and bad/rehashed unsafe sequence regressions. Root integrated package/CI/docs and pinned official PostgreSQL18.6 indexsha74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336 afterregistry inspection. Initial18 proof failed exactschema hash; actual17/18 metadata comparison showed only38 namedNOTNULLconstraints added by18. Separate known fingerprints preserve closed drift/cross-major behavior. Root15cases passed onEACH17.11/18.6 before source review; rootconfiguration/doclinks passed. No installer/website/native/candidate execution reruns needed for operator-only data code.

Full9-file Astra/high privacy andSol/high compatibility at74f7d7a found one deduplicated date-format issue (P2/P1): ::text timestamps inherit DateStyle/TimeZone. Root added differing SQL/DMY Toronto versus ISO/MDY Auckland regression, which failed import before correction. Transaction-local ISO/YMD+UTC correction018e3ab then passed16cases onEACHPostgreSQL17.11/18.6, preserving full row digests/microseconds, private modes, exact JSON bigint/bytes/source/credit/history, unused/called sequence, rollback/trailer/binary failures, snapshots, locked/occupied targets and role/schema refusal. Sol/high complete3-file targeted closure accepted fix with0newfindings;3isolatedunitpasses/1PGsuite intentionally skipped, root actualproof reused. Backup review3turns/2initial+1targeted/1fixbatch; cumulative38 includes3earlier provider filter failures. Earlier task-scoped workflowbudget waiver does not bypass generic checker/hosting gates. Requestedconfigs known; effective models/tokens/cost/reviewer seconds unknown. RootREADME patch with assumed header failed harmlessly, then appended atverified file; no content lost. All ownedtestfixtures stopped; nohosted backup/cutover/encryption/retention/schedule, credentials/paidhost/publicworker/deployment/merge or new student-size cap. Current plan and operating gaps remain explicit. Starting weekly62%remaining, healthy321GBcached then318GBfresh/2GBrequired fordatabaseimage are account/system readings, not attributable cost. Primary funding/Pika/private materials preserved; no cleanup/restart/prune.


## Release availability and event-preserving backups — 2026-10-12

Previous backup receipt ae64c6e passed CI38312319015. Sol/high withdrawal writer delivered against that base, then stopped: trusted004 append-only events with private reason/session-user actor; exact origin metadata, preview, JAR, sources, POM/checksum GET/HEAD410 before byte reads; latest/search/history filtering and identical-hash restoration. Runtime API has only four event-column reads; checker/publisher no event access. No new credentials, public moderation endpoint, candidate execution or pin substitution. Writer13availability cases and51inherited PostgreSQL cases passed with inert/mock checks. Coordinator inspected source and added private reason-file mode600/ownership/no-follow/nonregular/byte/UTF8 refusal plus regression, major-selectable fixtures, package/CI and docs. Final14availability cases passed on EACH17.11/18.6 (9actual PostgreSQL role/route/concurrency/CLI cases+5unit/CLI).

Coordinator updated backup format2/000–004 to include seven persistent tables, preserving private reason/actor/microsecond timestamps/revisions1,2,10. Derived schema hashes from actual trusted004 fixtures:17 has114schema records/3d424b82c905b3efe76fb9f00c5619d42ad346d04d10355a72b1eb52df1972d8;18 has159records/97bf1d64ee8d802bd2ca60102a614f8e93939b2c10749adfc430296cbab622d4. Closed schema/version checks retained.16backup cases passed on EACH17/18, including full row digests, private events and existing date/sequence/rollback checks. Format1 rejected deliberately; trusted prior018e3ab/000–003 recovery then004 documented. No real legacy archive was generated or migrated.

Coordinator14editor/catalog cases, configuration/doclinks,77website passes/2existing optional HTTP skips, types/build passed. Earlier unchanged DOM/browser/native checks reused; new real410 paths proved through read-only/enabled/proxy adapters, and editor fake withdrawal leaves POM intact. No new VSIX/kit/installer, interactive installed-editor or physical Windows/Linux proof. Owned15469/15471/15461fixtures stopped; Pika/primary funding/private materials preserved. Public deployment/schema000–003 unchanged; no hosted operator/backup/purge. Edge metadata60s/object3600s, browser1year and indefinite local Maven caches mean origin410 is not global revocation. Public authoring stays closed; old provider-rejected checker review remains unresolved. New source awaits bounded two-reviewer independent phase against ae64c6e; prior cumulative38 includes3historical failures. Weekly60%remaining/317.7GBhealthy are shared readings; effective config/tokens/cost/time unknown. New numeric student quotas remain unapproved.

Withdrawal acceptance: complete22-file ae64c6e31385b1125bb2e558c2ca160c87220bf7..70264f7c6aab8bc9c08cc5d2cd8853dd1bb4f1ff independently reviewed by Astra/high privacy/authority and Sol/high compatibility/recovery, zero actionable findings. Reviewer8 and19 isolated tests passed respectively; supplied root PostgreSQL17/18/website proof reused without services/DB/Java/credential actions. Phase2actualturns/oneinitialwave/zerofixbatches; cumulative40 retains3historical failures. Effective model/tokens/cost/reviewer seconds unknown. Hosted migration/operator/purge/recovery timing, genuine legacyformat1→004 recovery and installed-editor/physical OS remain unverified. Source pushed to draftPR26; CI38314558779 pending at this record. Only factual acceptance/next-action docs changed after source review. No public activation or old checker acceptance. New1MB/version,10MB/contributor,128MBtotal policy question remains unanswered/unimplemented.


## Hosted-data recovery and aggregate health — 2026-10-12

Withdrawal sourceCI38314558779 at70264f7 and receiptCI38314902391 at2018c6a both passed. Root completed read-only actual Neon18 export with trusted independently accepted018e3ab format1/000003 backup code/current unchanged runtime role setup, solely existing private operator credential. Snapshot78023bytes, persistentcounts[1,1,1,1,1,4], SHA3f30961c352eba3b2006b5404c2063da30af0bf8884b46faa1b03e1a53790241. Restored into disposable local pinned PostgreSQL18 and re-exported byte-for-byte; locally migrated004 and exported format2, counts[1,1,1,1,1,4,0], SHA24d80523a1a0a358d8c6bb60b43259a03b6a932f54f1ef9f0e24327a26cdcaa3. Temporary authentication empty/excluded. This closes the real schema/legacy-format migration drill gap with actual maintained data, not a productionrestore/cutover or encrypted retention schedule. Private700root/600archives/receipt under ignored .verification/hub-controls/private-neon-recovery-*; no values/source/URLs logged. Generic pinned pg SSL-version warning contained no credentials. Fixture15475 stopped; no production mutation, account change or Java execution.

Sol/high operations writer delivered four new files from2018c6a and stopped. One read-only consistent aggregate SQL report, fixed16metrics/9warningcodes/exact decimal byte accounting; existing global budget pressure, submission-age/stale leases/recent infra-error counts only. Ordinary failed student verdict excluded. No schema/grant/queue/source/lease/auth mutations. CLI --alerts-only omits all counters/content, fixed failures,0/2/1 exits and30s watchdog. Writer13tests passed on EACH17/18 (4actual-role+9unit), plus9unit after final mixed-env/cleanup hardening. One fixture-only correction replaced sorting full205MiBsource JSON with sorted in-database row digests after tmpfs exhaustion; compressible inert data only, no Java. Root9unit, configuration/doclinks and actionlint passed; full source review pending at this record. Prepared main-only/canonical-repo/explicit-flag daily health-test workflow has pinned actions, contentsread, no checkout credential, no install scripts, no PR trigger, final-step-only API secret, codes-only logs/no artifacts, one concurrency group and5min timeout. No GitHub environment/secret/variable or hosted alert activation. Actual schedule/notification/hosted latency remains unverified; current size-limit question unanswered.

Operations acceptance: complete13-file2018c6a8716228f96fb891bfc8c577c5f718bae6..1cda139325102a78cd809dd206274e3d5a9155ca passed independent Astra/high privacy/credential and Sol/high compatibility reviews with zero actionable findings. Each reviewer9unit/actionlint/diffcheck passed, reused actualPG17/18 proof, and read only the allowed private recovery receipt to confirm hashes/counts/oldschema/localupgrade. Phase2actualturns/oneinitialwave/zerofixbatches; cumulative42 includes3olderfilter failures. Measurement caveat clarified in docs: current errored submissions created within24h, not24herror-event count; application source unchanged. Root then ran accepted monitor once locally against existing hosted Neon/API credentials: ok/no alerts,1463ms; private700directory/600receipt under ignored .verification/hub-controls/private-hosted-health-*, no metric/source/URL/credential log or production mutation. Only Mac-to-Neon connectivity is proved; GitHub-runner/environment/secret/notification/schedule remain unconfigured/unverified. No hosted worker, account/billing changes, main merge or public activation. Source1cda139 pushed to draftPR26; CI38316464144 running at record. Only factual acceptance/measurement/proof docs follow source review. Requested configs known; effective config/review seconds/tokens/cost unknown. Fresh317.55GB healthy storage/1GBroom check, no cleanup/prune/restart. Prior goal turn was progress (withdrawal source accepted/pushed); this turn completes operations source acceptance and actual hosted read-only export/recovery/health evidence.


## Targeted public cache-removal prerequisite — 2026-10-12

Prior health sourceCI38316464144 and receiptCI38317306712 passed. Root coherent change adds only bounded public cache tags: library ID groups metadata/allversions/artifacts/checksums/previews, separate catalog tag groups alllisting queries. Regeneration only after existing public/status/header/type checks; matching own-upstream tag allowed, unrelated/private/wildcard tags fail no-store and are never forwarded. Private/error output tags erased. Existing TTL/browser/exact-byte/pin/API authority policy unchanged. Root7cache cases,14availability cases onactualPG17 (including alladapter410untagged and restored200samehash/librarytag),79websitepasses/2existing optionalHTTPskips/types/build passed. No SQL/schema/role changes; earlier17/18SQL/native/DOM evidence reused; fixture15469stopped. Source not reviewed/deployed at this record.

Read official Vercel purge/CLI contract and local54.17.2help; cache deletion avoids stale-once softinvalidation. Verified .vercel projectprj_b8dDCbuiF8uzVcXYMLghpWTAr4aA/team_jKbtHZ7k3VeEdJKdqf2GOToE. Native targeted deletion of zero-hub-library-ui1,zero-hub-catalog accepted under existing scoped operator session. Maintained ui1:0.1.0 JAR unchanged6802bytes/SHA776310da0cd8dcff09a6374b61d906d2b34fa633bc603b15770e24963b9c433a; MISSbefore/HITafter. Current publicb0e7177 source predates tags: this testspermissions/control acceptance only, not removal of a cached tagged response, propagation/expiry or hosted withdrawal. Private receipt under ignored cache-removal-*; no wildcard/globalpurge, upload/auth/worker activation, credential/data/schema/deployment or version mutation. Runbook future event→tagdelete→exact410/catalogchecks, restore→samehash and browser/Maven localcopies limits. Full objective unfinished; new quotas remain unapproved and old rejectedcheckerreview still held. Single Sol/high standard complete review planned; cumulative42 until actuallaunch.


Targeted-cache acceptance: complete eight-file34c45eb5dbfc1f32fcede6f9aa30cf108735de6f..4077dd8ee4510cefb8ded9c88fd32c619097324b passed independent GPT-6.1-Sol/high review with zero actionable findings. Reviewer inspected repository guidance, all changed files and immediate callers; seven isolated cache tests passed. Supplied actual PostgreSQL/website evidence reused. Public tag bounds/grouping/regeneration and private/error exclusions preserve TTLs, exact pins and byte integrity. Runbook project binding, event/deletion ordering, operator credential separation and client-copy caveats accepted. Phase one actual review turn/one initial wave/zero fix batches; cumulative43 includes three historical provider-filter failures. Requested model/effort known; effective configuration/reviewer seconds/tokens unknown. Source CI38318782410 passed. Only factual acceptance notes follow review. Native deletion receipt still establishes permissions only: deployed source lacks new tags, MISS→HIT did not prove tagged-hit removal. No deployment, schema004 migration, public authoring activation, main merge or generic checker acceptance. Storage policy remains unanswered; hosted cache withdrawal, backup policy, isolated execution and real OAuth remain incomplete.


## Open contribution and curation policy — 2026-10-12

Owner approved no lifetime contributor storage/library-count quota and final
Zero owner/designated-maintainer authority to archive, hide or remove hosted
content. Canonical policy ZEROHUB-POLICY.md distinguishes discovery archiving,
retained downloads where practical and deliberate byte reclamation; published
coordinates stay reserved, pins do not change and MIT notices remain. Plan
explicitly schedules removal of existing16MiB/account cumulative source and
100lifetime reservation guards. New numeric artifact/global budgets remain
undecided. Seven-file7c1b7d4..b9c29e0 documentation delta independently reviewed
by requested GPT-6-Luna/medium, complete coverage/no actionable findings. Root
configuration/doclinks/diffcheck passed; reviewer reused root checks and passed
range diffcheck. One actual turn/one initial wave/zero fixes; cumulative44
includes three older provider-filter failures. Effective config/time/tokens
unknown. No runtime/schema/UI/credentials/Java/deployment/public-activation
change; held checker review excluded. Acceptance notes only follow review.


## Lifetime caps and contribution journey — 2026-10-12

Owner instructed removal now, archiving later, and user-flow proof. Root removed
local lifetime16MiB-source/100library guards without replacing them;51PG17 and
10PG18 admission cases passed, including restricted-role threshold regressions.
Sol/medium bounded read-only workflow audit found terminal duplicate-result,
reload recovery and same-folder correction gaps, then delivered/stopped a bounded
UI/helper writer assignment. Root integrated pending-poll serialization, generated
README/ZIP roundtrip and observed mobile overflow/availability fixes.91website
passes/2optionalHTTPskips, actualNextHTTP2passes/types/build/root checks passed.
Actual inert browser journey and trusted fixed-preview native compile/render
proof are recorded in VERIFICATION; neither accepts the held generic checker or
proves full hosted/student/installed-editor operation. Primary/Pika unchanged,
all owned fixtures stopped, no deployment/credentials/release changes. Current
delta awaits independent review. Requested workerSol/medium; actual time/tokens
unknown. One fixture timestamp and one temporary harness method error corrected
without product-authority changes. Human cross-thread coordination verified;
reviewed MVP source integration is queued with distinct path/release ownership.


Cap/flow acceptance: full18-file192d700..b6e23cc independently reviewed by
GPT-6.1-Sol/high, complete scope/no actionable findings;21focused helper/ZIP/poll
cases independently passed. Supplied actualPG17/18/browser/native evidence reused.
One actual review turn/initial wave/zero fix batches; cumulative45 includes three
historical provider-filter failures. Effective model/time/tokens unknown. Held
checker boundary excluded; no public activation/main merge acceptance inferred.

## Coordinated MVP integration — 2026-10-12

Integrated reviewed peer SOURCE-only patch fa15c920..57909be as8ceb45d,
58aab804 installer fallback as35fe3e9 and ef0d953 setup guidance as6cedf89.
20source paths reconciled; peer confirmed15byte-identical and5preserved newer
root interactions. Patch SHAf127492a857a165d1ce3ba2af229de49d76cf1dcaadb0acdfe4012265b802ec4.
No peer handoff/evidence snapshots imported. Root185tests, website94passes/
2optionalHTTPskips, actualNextHTTP2passes, finite drawing/config/types/build passed.
Current integrated320px card/manual expansion fits320px with contained code scroll.

Actual deployed history query returned400. Sol/medium native client writer
delivered strict first400-only full legacy history compatibility in two files,
then stopped. Root14focused cases passed. Real public catalog and maintained
ui1:0.1.0 exact JAR/sources/POM integrity verified, no Java executed. One legacy
shape only, no latest-only fallback, same30s/byte/release bounds and exact pins.
Final integration source review pending. No artifact/version/installer change,
publication/deployment/schema/auth/account mutation. Physical Windows trial
deferred by owner; local candidate packaging needs accepted integrated SHA and
one explicitly reserved writer. Public checker/host/OAuth gates unchanged.


Integration acceptance: complete30-file b6e23ccf3a668ac9af93f96a922b598f6fef52d0..
13fa3d2d115bc72a3f7483bff2b0813f71537318 reviewed by GPT-6.1-Sol/high,
no actionable findings. Reviewer inspected full diff and immediate Git/catalog/
download/tutorial/drawing callers, verified deployed legacy complete-history
source contract, passed diffcheck and reused supplied focused/full proofs. One
actual final integration turn; cumulative46 includes3historical filter failures.
No remediation; effective model/time/tokens unknown. Held checker excluded.

Root additionally applied the real live catalog's verified ui1:0.1.0 plan to a
disposable Java app. Wrapper downloaded exact published POM/JAR; compile passed.
Finite native Start→app-content→Restart assertions passed on Mac/JDK17, then
closed. Temporary harness initially lacked JavaFX module launch flags; corrected
with pinned modules, no product change. CGDisplayLink warnings remained. Trusted
maintained sample only; existing Maven cache used for other dependencies. No
arbitrary candidate/checker, real installed-editor action or clean-machine proof.
Evidence under ignored .verification/hub-controls/live-client-consumer.
No publication/mainmerge/deployment or activation. Factual receipt only follows
accepted source. One isolated candidate package writer will be reserved next.


## Frozen local0.5.8 candidate and platform limits — 2026-10-12

Owner-authorized cross-task coordinator delivered five reserved version/guidance/
fixture files fa802d8..ed5242c86f1e6d36b58f3a034aada3f385ec7ea8. Source review
reported complete clean Sol/medium;7installer cases independently passed. Only
fixture metadata derives current version; production provenance guards/public
Mac0.5.7 and published-kit manifests unchanged. First versioned website run had
five fixture failures, corrected in reservedtestpath; final94passes/2optional
skips/build and188rootpasses/1PowerShellskip,release53/installer8/Macrelease2
passed. Root integrated by fastforward to exactsourceSHA, inspected fivefiledelta
and passed7installer/config/diff checks. RootCI38327689796 already passed baseline
fa802d8; new version receipt CI must be verified separately.

Three frozen files under mvp-release-candidate/zero/dist/candidates/zero-0.5.8-ed5242c:
completeZIP254480bytes/c5c52b38ac91ddf498e94eeb3bd2a5ee219ea43b47cccccb9d8b761cbff7552d;
starter183587bytes/9bf52c9e557662ccd69975398990bd2ec1449f598b85dcbd3af1c94d881321b6;
VSIX48149bytes/b0935bcd2389f98d25e139c4c678377adb39f312afdf9fb387fd50bcaf5c2c24.
All extension source files match accepted source; extracted Maven/modes/licenses
verified. Root independently matched all3hashes. Windows net48 harness0warnings/
errors,Mono228checks with exactZIP extraction/update/save preservation passed.
UnsignedEXE320512bytes/e8579246ae44557dcb9d15180208ef4b3d737167c8f4f49d07ccd2dc4c580d8e
was crossbuilt/header/CLR/embedded-exactZIP verified and roothashmatched. Its
sourceDirtyfalse/nativeWindowsTestedfalse/unsigned receipt and PC checklist remain
under zero-0.5.8-windows-ed5242c. No repack/sign/publish/tag/mainmerge/deploy.

Root isolated Mac install lists zero.zero@0.5.8 and exthostlog confirms activation
workspaceContains:zero.json. Long ignored profile path exceeded macOS103char IPC
socketlimit; corrected to short private/tmp path/copied kitsettings, no product
change. Native app control binds older normal process63054 rather than owned
new77146, so no actual installed Browse/Add/Apply/Run UI proof. Root stopped only
owned77146 after exactcommand verification; normalprofiles/studentwork unchanged.
Private local receipt under .verification/hub-controls/installed-editor-058.
Physical Windows/WinForms/PowerShell5.1/WebKit/clean-machine/full hosted student
journey remain unproved. Public contributions still closed, oldchecker review
excluded. Candidate artifacts remain bound to ed5242c; later factual docs are
not a repack or publication receipt.


Candidate-review receipt peer-candidate/ed5242c/1: all5files plus immediate release
contracts fa802d85e8fde5ca91035286bb770644a218edcd..
ed5242c86f1e6d36b58f3a034aada3f385ec7ea8 independently covered by requested
Sol/medium; complete/no actionable findings,7installer cases passed. One actual
review turn/initial wave/zero remediation batches; cumulative47 adds this peer
turn to46priorrootturns, includes3historical filter failures, does not count reused
peer baseline coverage again. Effective model/time/tokens unknown. Candidate
version/source/assets remain local, not pushed or published; draftPR/sourceCI
currently stop atfa802d8. Factual receipts do not weaken any held launch gate.

## GitHub sharing replacement — implementation candidate, 2026-10-12/13

Isolated `codex/github-sharing-adoption`, base `4ed9cd4`. User requested full
implementation, wholesale replacement and task-scoped waiver of routine
usage/review-budget stops. No actual provider rejection is waived. Generic
library execution remains closed behind its previously rejected acceptance.
Three bounded Sol delegates: authoring and registry high, website medium;
coordinator integrated contracts, cleanup, packaging and workflow. One writer per
component, no Git conflicts. Effective worker tokens/cost unknown; earlier 50%
weekly remaining is account-wide. Fresh storage ~342GB, no task cleanup needed.

Root suite210pass/1portablePowerShellskip (~111s), registry23pass (~38s),
website38pass/types/build, contracts/editor/configuration18pass. Real local Check
builds helper/widget JARs with two finite examples; local/published roots compile.
Native editor fakes cover cancellation/drift/undoable POM edits/new-folder game
opening/recovery. They do not establish interactive VS Code or physical Windows.

`node scripts/verify-sharing-consumers.mjs` passed21.216s: two independent Maven
projects each Add1.0.0→Update1.0.1→Revert1.0.0. Six fresh library resolutions over
local HTTPS, actual code-source JAR/hash/behavior verified, contributed namespace
removed from cache before each build, no local library classes, Maven source
archives hash-verified. Node/Maven trust scoped to child processes with disposable
cert/truststore; global trust unchanged. Ignored receipt/logs under
`.verification/sharing-consumers/`. No public hosted or managed-executor claim.

VSIX0.5.8 bundles the canonical Java Check harness and disabled operator settings;
packaging and extracted-kit verification passed. Browser Playwright fixtures
check discovery kinds, expanded usage and search misses, with desktop/mobile
screenshots under ignored `output/playwright/`. Publication workflow remains off
until reviewed exact source and operator configuration. No push, deploy, public
publication, credential mutation or hosted data deletion performed.

Independent implementation review pending; generic held checker acceptance is
excluded and stays unresolved. Live GitHub/Blob ETag and permissions, hosted
journey, Windows and novice pilot remain outstanding rollout evidence.

### Replacement review and remediation batch 1

Initial head `c3b946581446a38b6b07b64a4d04e62d997ccece`, base `4ed9cd4`.
`sharing_platform_review/turn1` Sol/high completed new nonexecuting game/registry
scope with4blockers: fresh queued closure, workflow-budget progress, inherited
Git extraction and static game structure. `sharing_workflow_review/turn1`
Sol/high completed student/build/website scope with3additional blockers: FX
startup, bundled catalog precedence, game Git exclusions; stale sample guides
nonblocking. Duplicate inherited-Git finding deduplicated. No generic held
executor acceptance attempted. Effective configurations/tokens unknown.

Batch1 resolves these together, with source-failure records before staticchecks,
numeric-ID source recovery, per-item cursor checkpoints, queued-first/interleaved
processing,15minute wall/30second source budgets, safe generated ignore rules,
static main/framework/license/POM checks and explicit retry/withdraw/restore CLI.
Coordinator additionally corrected authenticated credit after rename, classified
accepted-version conflicts as source failures, and verified all packaged extension
source bytes. A public request-result lookup was missing and is now implemented:
fixed bounded Git reads,32relatedrecords max, no private attempts reflected,
available link only after exact ledger/catalog agreement, cancel/manual retry.

Root215pass/1portablePSskip (~111s), followed by new cancellation delta11pass
(~15.8s). Actual owned resistant POSIX parent+child force-stop119ms; Windows
fixed-system taskkill/dead-parent/retained-pipe/deadline cases are mocked. An
unconfirmed stop retains temporary files and reports their path. Helper/JAR and
Label/Button FX checks still pass. Registry31pass (~36s) plus final version-conflict
correction check; GitHub8pass; website46pass/types/build before the small controlled
version-conflict message delta (9focused result checks thereafter). Real two-
project HTTPS proof remains valid for unchanged consumption code. Browser fixtures
confirm requestURL validation and exact available links; mobile screenshots ignored.

Review ledger:2launches/1initialwave/1fixbatch completed, targetedreview next.
Default usage/review-budget stops waived; no provider/execution gate bypass.
Current accountweekly47%remaining is shared, not task cost; no reset/credits used.
Actual provider/public publication, physical Windows/interactive editor/novice
trials, hosted backup restoration and held library acceptance still outstanding.
