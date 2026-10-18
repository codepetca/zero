# ZeroHub inline stars and project feedback — 2026-10-18

Owner asked for broken-project visibility and one GitHub like per account, then
refined GitHub stars to work directly from ZeroHub. Implement optional minimal
GitHub App sign-in, inline star/unstar, cached public page reachability/counts
and prefilled issue reports. Browsing/Play remain public; no publisher token,
registry writes, background monitor or separate votes database. Code and source
review first; new App registration/security grant and production secrets require
specific owner approval after the reviewed result is concrete. Do not use the
maintainer account to star projects as a test without authorization.

Worktree /Users/stew/.codex/worktrees/zerohub-simplify/zero, branch
codex/zerohub-project-feedback; base41ba316. Parent owns UI/docs/integration;
Sol/high hub_github_auth delivered auth/routes/tests, Sol/medium
hub_project_status delivered bounded public resolver/checks/routes/tests. Both
focused deliveries and integrated website typecheck pass. Parent added revoked
session clearing and UI/report integration. Next: full local checks/browser,
frozen-head two independent high-risk reviews, then concrete App approval.
Execution/review receipts live in .verification/hub-project-feedback/plan.json.
Weekly usage65% remaining (account-wide, not attributable); storage healthy~310GB.
DeepSeek paused; no task/goal/automation creation. Preserve unrelated main
checkout funding work and all earlier ignored verification/profiles/backups.

Prior Flap Motion authorPR101 merged41ba316, public0.1.0/0.1.1 native/browser
acceptance complete. Publisher policy stays11c5451; installer0.5.19 unchanged.
Public Projects Drawing Pad/Grove Guard; Sky Hop withdrawn. Current work is
website-only. Real provider OAuth/consent, physical Windows and Safari are not
proven by local unit/build tests.
