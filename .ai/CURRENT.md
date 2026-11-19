# Public reporting backend acceptance — 2026-11-18

Owner authorized branch push/PR, public inbox, dedicated App/database setup and
end-to-end testing; Neon provisioning must go through Vercel. [PR386](https://github.com/codepetca/zero/pull/386)
remains draft and unmerged. Source `d41f4582b` integrates main's published 0.5.81
records; reporting/editor code is unchanged from the reviewed integration.

[codepetca/zero-reports](https://github.com/codepetca/zero-reports) is public,
ID `1463652567`. App `codepet-zero-reports` (`5827621`), installation `183555907`,
has issues-write/metadata-read access to that repository only. Vercel Free Neon
`zero-reports` is project `crimson-silence-47818786`, store `store_mqf7HZUM4YAt47xY`.
Its direct endpoint and restricted `zero_reports_runtime` role are configured.
Zero production has nine server variables; collection remains disabled. Its
three credentials are sensitive, with no reporting credentials in previews or
provisioning-owner binding. Private operator files remain outside Git.

Live acceptance passed: controlled editor API fixture → actual local HTTP
receiver → verified-TLS Neon → App-authored public issues. Automatic/manual,
deduplication, recovery, schema rejection and privacy canary checks passed.
[Issues1](https://github.com/codepetca/zero-reports/issues/1) and
[2](https://github.com/codepetca/zero-reports/issues/2) are closed activation tests.
Read-only health and authenticated local reconciliation pass. Two independent
setup reviews and a final environment-isolation verification are clean.

Hosted source and browser checks pass at `d41f4582b`. Windows packaging checks
fail because they compare the immutable published 0.5.81 kit against newer PR
source. Preserve the strict verifier; see [evidence](../docs/EVIDENCE.md) for the
required source-bound workflow correction. Hosted/native-dialog/physical Windows
acceptance, retention/backup limits, scheduler execution and editor release remain
pending. No merge, production deployment or global collection was performed.
Preserve the original dirty checkout and other Zero worktrees. See
[operation](../docs/PROBLEM-REPORTING.md) and [release ledger](../docs/RELEASE-LEDGER.md).
