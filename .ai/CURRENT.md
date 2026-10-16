# Current state — Windows flow polish, 2026-10-16

Owner has deferred Windows signing and requested the remaining Windows flow be
as smooth and automatic as Mac. Continue local implementation/verification and
prepare an unsigned disposable trial; no push, publication, merge, account or
paid-service action is authorized by this phase. Public0.5.17 stays unchanged.
DeepSeek remains paused. Ordinary VS Code/account/global Java settings untouched.

Working branch codex/windows-auto-setup, base e268b93, implementation worktree
/Users/stew/.codex/worktrees/windows-auto-setup/zero. Prior release-readiness head
42e9512; prior source reviews cover 3a4fe7a2 and f5209e2. Original dirty funding
checkout and separate web-export/tutorial task are untouched. Do not archive the
implementation worktree; unintegrated local artifacts remain useful.

Implemented native per-user Velopack Setup/Start shortcut, pinned private Java,
compatible VS Code reuse/private fallback, isolated profile, saved-session open,
authenticated background updater, explicit signing tooling and verified future
website feed/download metadata. Production feed RSA3072 trust is configured;
private key remains outside Git in private maintainer storage. Encrypted backup,
signing and actual Windows release acceptance remain pending before publication.
Development packages deliberately disable the production updater.

Current phase changes: recognized damaged Java/editor automatically reinstall
from verified downloads, failed/cancelled repair restores the old folder for
retry, malformed isolated settings reset to defaults, warm-start child probes
reduce12→8 while Open still checks readiness, accepted update discovery gets
foreground progress/retry/error UI with one installation consent.
Sol/high read-only parity worker completed four concrete findings; coordinator
implemented them. Separate Sol/high worker owns scripts/test-windows-javafx*,
Windows CI and WINDOWS-TRIAL.md for actual JavaFX window plus offline cached rerun
in a disposable project. No overlapping writers; worker delivered3focused tests plus batch-argument proof
(4pass/1existing Windows-only skip) and actual fixture compilation with Java21/
pinned JavaFX21.0.12. Combined review and final packaging are next.

Current checks: native985 and updater11 Mono fixtures pass; full net48 GUI builds
with0warnings/errors;18Windows signing/key/package tests pass using private
PowerShell mocked Authenticode; npm run check and diff whitespace pass. Actual
Windows installer/editor/JavaFX/process/locking and automatic A→B remain untested.
Remote CI has not been run. Signing hold prevents trusted-publisher trial only;
unsigned functional trial may proceed. Existing dev artifact is from prior source
and must be rebuilt after current review. Independent combined-delta review next.
Account-wide weekly remaining49%, healthy storage318GB at phase start; not task cost.
Detailed historical delivery and limits: docs/EVIDENCE.md, WINDOWS-INSTALLER.md,
WINDOWS-TRIAL.md and WINDOWS-SIGNING.md.
