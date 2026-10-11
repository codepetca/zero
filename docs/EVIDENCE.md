# Delivery evidence index

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
budget, and boolean schema acceptance. Remediation passes39admission and20acceptance/release regression tests. Zero
43release tests,24site tests, types/build and configuration/link checks pass. Source
remains local pending independent review; no new release or live provider.

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
