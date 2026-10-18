# Zero sidebar refinement — 2026-10-18

Worktree:/Users/stew/.codex/worktrees/release-readiness/zero.
Branch codex/sidebar-zerohub-actions, based on merged GitHub App/branding
PR102:f719d18. Preserve the original dirty /Users/stew/Repos/zero checkout.

Current approved UI: no separate signed-in username row; repository button has
a right-pointing chevron, a label wrapping to at most two lines and its full
accessible name/tooltip. It opens the existing project menu, including GitHub
account… and Review or restore changes…. One ZeroHub menu contains Projects,
Libraries and eligible Share project. Add assets… is beside Files; Copy asset
paths appears there after import. No separate tools row. Existing GitHub App
identity, import/recovery policies, ordinary Java and local Run remain intact.
Branding assets from “Simplify ZeroHub projects” are preserved.

Latest source d225275:rootcheck and30affected tests pass; independent Luna/medium
complete-diff review is clean,one launch/no corrections. Browser actual-render
fixtures confirm light/dark280px layout, right chevron,two-line name,full accessible
label and no horizontal overflow. Prior state/menu coverage is reused; current
full-suite and earlier test-only correction details are in docs/EVIDENCE.md.
Native VS Code click-through and physical Windows remain unverified. Temporary
preview tab/server closed; screenshot/logs:.verification/sidebar-chevron-20261018.

Local-only delivery. No new source push, merge, installer build or release is
authorized by these sidebar requests. Next:owner-authorized integration and a
new native preview. Shared identity/recovery guidance:docs/ZERO-IDENTITY-PLAN.md
and docs/ZERO-AUTH-RECOVERY.md; earlier identity acceptance limits remain.
DeepSeek paused through2026-12-31. Recent weekly remaining44%; cached storage
301.4GB healthy,no cleanup. Receipts and historical verification:docs/EVIDENCE.md.
