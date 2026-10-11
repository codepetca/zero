# Delivery evidence index

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
