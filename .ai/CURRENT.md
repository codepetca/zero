# Public structured reporting — 2026-11-18

Owner authorized pushing `codex/automatic-error-reporting`, opening a PR and
creating the public reporting inbox. [codepetca/zero-reports](https://github.com/codepetca/zero-reports)
is public with issues enabled, numeric repository ID `1463652567`. Its README
explains the structured-only contract and pending activation.

The sidebar stays concise. Manual reporting confirms submission without a text
field or JSON preview. Schema version 2 rejects free text and unknown fields.
Public opt-in and queue are separate from the legacy private policy. The server
revalidates stored samples and authenticates a public destination and App bot.

Reviewed source `65580f1093661b3d9d62cca4163d99cc3dac2edb` passed two independent
public-policy reviews, 116 focused cases with actual isolated PostgreSQL/fake
GitHub, source checks, website typecheck and production build. Current work
integrates main `b61d160d3` (0.5.81), preserving browser-tool cancellation before
report capture. Targeted integration review found no blockers; all 128 focused cases and
source checks pass. [Draft PR386](https://github.com/codepetca/zero/pull/386)
is pushed and mergeable. Hosted CI has started; its final result is pending.

Owner now authorizes dedicated App/database setup and end-to-end testing.
Created App `codepet-zero-reports` (5827621) and Vercel-provisioned Free Neon
`zero-reports` (`crimson-silence-47818786`, store `store_mqf7HZUM4YAt47xY`),
connected to Zero production only under `ZERO_REPORTS_NEON`. App key download and
Vercel identity verification await the owner. Runtime SQL schema/role, end-to-end
acceptance, scheduler enablement and an editor release remain pending. Native report-dialog,
live App attribution and physical Windows acceptance remain unverified. No source merge or release is authorized. Preserve the original dirty checkout and separate
0.5.81 preparation worktree. See [reporting operation](../docs/PROBLEM-REPORTING.md),
[evidence](../docs/EVIDENCE.md) and [release ledger](../docs/RELEASE-LEDGER.md).
