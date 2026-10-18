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

Latest source2cc0424:one Run/Stop button, with focusable/unavailable Stopping…
until browser queue and native preparation/shutdown settle. Queued/checking/
compiling/running work offers Stop immediately; errors/preview closure restore
Run. Host guards handle stale clicks; aria-disabled plus client guard preserves
keyboard focus without accepting activation. Explicit Run App/Stop App palette
commands remain. Native diagnostic starts/ends and preparation are tracked.

Root check and final npm test pass:714tests,711passed,3skipped,0failed;54focused
checks pass. Independent Sol/medium complete review plus targeted focus fix
review are clean:2launches,1correction batch,0outstanding findings. Real Chrome
keyboard fixture using actual renderer/client confirms focus through Stop →
Stopping → Run, ignored unavailable activation and no focus steal after deliberate
movement. Layout fixtures show all4states. Logs/screenshot/receipt are ignored
under .verification/run-toggle-20261018. Native VS Code/Windows remain unverified;
pre-existing configured-native resolution-to-start cancellation gap is unchanged.
Earlier sidebar review/history evidence remains in docs/EVIDENCE.md.
The side-by-side branch/history suggestion remains a proposal; merge (not rebase)
semantics and current branch controls are unchanged by the toggle delivery.
Temporary preview tab/server closed.

Local-only delivery. No new source push, merge, installer build or release is
authorized by these sidebar requests. Next:owner-authorized integration and a
new native preview. Shared identity/recovery guidance:docs/ZERO-IDENTITY-PLAN.md
and docs/ZERO-AUTH-RECOVERY.md; earlier identity acceptance limits remain.
DeepSeek paused through2026-12-31. Recent weekly remaining42%; storage
302.8GB healthy,no cleanup. Receipts and historical verification:docs/EVIDENCE.md.
