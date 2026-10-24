# ZeroHub metrics — publication, 2026-10-24

Owner authorizes publishing the reviewed metrics code and verifying it live,
with all services kept on Free. Use the reviewed PR/CI flow; no paid plan,
paid add-on or automatic upgrade is authorized. Preserve primary funding work
and unrelated Dev worktrees/profiles. Task branch: `codex/zerohub-metrics`.

Reviewed source: initial67031a42 + targeted76f52630 + native Vercel config230401b3;
all changes since are handoff/verification documentation. Website177tests,
sharing86pass/4environment-skips, typecheck/build and root checks pass.
Plans, semantics and publisher compatibility: docs/ZEROHUB-METRICS.md.

`zero-hub-opens` exists in Vercel on Free, connected only to Zero Production.
Creation explicitly set autoUpgrade=false and prodPack=false. The integration
injects KV_REST_API_URL/TOKEN; no credentials belong in Git or browser bundles.

Next: publish the PR after exact-head CI; verify the production deployment,
real anonymous Play opens/durable totals and preview isolation. Coordinate both
publisher reader pins before new adoption observations are written. No native
installer release or historical adoption backfill is requested. Retain receipts
in ignored `.verification/zerohub-metrics/`; final CI/live status belongs there
and in the PR handoff. No separate task, goal or automation was created.
