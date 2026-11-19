# Automatic problem reporting — 2026-11-18

Owner approved implementation of minimal automatic error reports after opt-in,
a reviewed manual fallback and a private GitHub issue inbox. Work is isolated on
`codex/automatic-error-reporting`, based on `d098d0d2f` from main. The owner's
primary checkout and the separate 0.5.81 preparation worktree retain their work.

The coordinator owns the shared schema, documentation, integration and acceptance.
Sol/high owns the service, PostgreSQL coordination and GitHub delivery. Terra/high
owns editor collection, settings, manual reporting and focused editor checks.
Automatic reports exclude raw local diagnostics and identifying project/account
fields. Student compiler/runtime errors are manual-only where ambiguous. Reports
remain untrusted evidence for reproduction and review.

Implementation and verification are in progress. Next complete source checks,
real isolated PostgreSQL/GitHub-fake failure injection and independent security
and compatibility reviews. See [problem reporting](../docs/PROBLEM-REPORTING.md)
for the product contract and operational setup. Service activation, account and
credential changes, pushes, merge, deployment and an editor release are pending
separate applicable owner authorization. No live report delivery is established.

The public 0.5.80 release remains recorded in the
[release ledger](../docs/RELEASE-LEDGER.md#zero-0580--2026-11-18). Preserve immutable
assets, approved designs, ordinary Java and student ownership. **Learn to Build**
/ **Starting from zero** remains the positioning.
