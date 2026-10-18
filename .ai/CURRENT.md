# Zero sidebar refinement — 2026-10-18

Worktree: /Users/stew/.codex/worktrees/release-readiness/zero.
Branch codex/sidebar-zerohub-actions, based on merged GitHub App/branding
PR102 at f719d18. Preserve the original dirty /Users/stew/Repos/zero checkout.

Owner requested no standalone signed-in username row, a clickable repository
name using at most two lines without a visual chevron, and one ZeroHub button
with Projects, Libraries and eligible Share project actions. Account controls
remain in Project menu → GitHub account…. Existing GitHub App identity guards,
ordinary Java and local Run behavior are preserved. Branding assets remain as
merged by the other task, “Simplify ZeroHub projects”.

Implemented source106beeb; reviewed corrections through1a590f2. Independent
Sol/medium initial review and two targeted passes are clean; no outstanding
findings. Final check and full suite pass:707passed,3skipped,0failed. Focused sidebar
suite45passed; account-refresh workflow test passed. Browser fixtures confirm
light/dark two-line layout,
full accessible repository name, keyboard focus outline and no horizontal
clipping at280px. Native isolated VS Code automation timed out, so actual native
click-through and Windows are unverified. Temporary host/server/tab closed.

Local-only delivery. No new source push, merge, installer or release publication
authorized by this sidebar request. Next: owner-authorized source integration
and a newly built native preview. Details and final verification:docs/EVIDENCE.md;
ignored screenshots/logs/receipt:.verification/sidebar-refinement-20261018.

Shared identity/recovery guidance:docs/ZERO-IDENTITY-PLAN.md and
docs/ZERO-AUTH-RECOVERY.md. The earlier identity acceptance limits remain;
this menu/layout change does not complete those scenarios. DeepSeek remains
paused through2026-12-31. Start allowance45% weekly remaining, actual free
storage301.6GB healthy; no automatic cleanup needed.
