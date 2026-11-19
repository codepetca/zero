# Automatic problem reporting prepared locally — 2026-11-18

Owner approved opt-in automatic reports, reviewed manual reports and a private
GitHub issue inbox. Branch `codex/automatic-error-reporting`, base `d098d0d2f`,
reviewed source `2aad43a5d4bfe74a886b351a0e301941b4721476`. This worktree is
attached to the reporting chat. The primary checkout and separate 0.5.81 release
preparation retain their work.

Source implementation and independent reviews are complete. Sol/high reviewed
security/correctness and compatibility, with five review turns, two correction
batches and no remaining source blockers. The [reporting guide](../docs/PROBLEM-REPORTING.md)
records activation, bounded payloads, unknown metadata and publishing-only recovery.

Verification covers 57 focused reporting/native/browser/service cases (including
actual isolated PostgreSQL), 2 startup cases, 10 gallery cases and 31 real-Git
regression cases. The website suite had 873 passes, 2 timing failures and 3 skips;
the two affected files then passed all 37 cases. Source checks, typecheck and
production build pass within the [recorded scope](../docs/VERIFICATION.md).
The broad source run spanned corrections and was interrupted; no complete green
full-suite/hosted-CI result is claimed. The native dialog, physical Windows and
live GitHub/App service remain unverified.

Next obtain applicable publication authority, push a reviewed draft PR and run
full CI. Service activation requires the dedicated private repository/App,
PostgreSQL schema, server credentials and explicitly enabled scheduler. Automatic
reporting defaults off. No live reporting collection or new editor release has
been activated. The [0.5.80 release ledger](../docs/RELEASE-LEDGER.md#zero-0580--2026-11-18)
retains public release state. **Learn to Build** / **Starting from zero** remains
the positioning.
