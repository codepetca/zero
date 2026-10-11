# Current state

Updated 2026-10-10. This is the operative snapshot; historical instructions and
permissions in [the archive](../docs/history/ai-handoff-through-2026-10-10.md)
are evidence, not current work orders.

## Product and delivery

- Zero is the local VS Code extension/profile and ordinary Java/JavaFX teaching kit.
  Preserve explicit object updates and the minimal sidebar; no Code OSS fork.
- Zero **0.5.3** and Zero Community **0.1.3** are published. Website:
  https://zero.codepet.ca/. Lessons 0–12 ship in the kit.
- Published kit source: `c00e7a6d7e7d4bea9e14be821a1a75967fcf6d22`;
  published Community source: `7d4fa181d07f320cc4a305f60636e81aab9a9bcb`.
  Canonical branches are `codepetca/zero:main` and `codepetca/zero-community:main`.
- Both Community health bars remain experimental MIT components without a named
  maintainer. AI, CI and contributor receipts cannot accept or recommend them.
- [Publication evidence](../docs/EVIDENCE.md) records sources, reviews, PRs,
  CI and release links. [Verification](../docs/VERIFICATION.md) records limits.

## Current authorized work

Owner accepted the AI workflow audit fixes: compact recovery records, durable
publication evidence, trusted Community checks, exact AI request/schema validation,
and GitHub human-review enforcement. No live AI provider is being connected.
The previous release authorization completed; it is not a standing release grant.
No new kit release, student UI change, camera/HUD implementation or credential
change is included. Source changes stay local until separately authorized for PR
publication/merge. Repository branch-protection changes are authorized in this pass.

## Execution and ownership

- Clean managed Zero worktree: `codex/ai-flow-hardening`, base `f8f78290`.
  Sibling Community worktree: same branch name, base `f6460f48`.
  Primary Zero contains unrelated funding work; do not reset, stash or overwrite it.
- Coordinator owns Zero docs, both current snapshots, evidence indexes and GitHub
  rules. Community implementation worker owns admission/acceptance code, tests and
  contribution docs. One writer per component; no recursive delegation.
- Requested worker: GPT-6.1-Sol/high for CI/authority boundary. Effective model and
  attributable tokens unknown. Weekly24% remaining at start is account-wide.
  Automatic DeepSeek remains paused by owner preference through 2026-12-31.
- Status: initial independent wave complete; first correction batch complete. GitHub
  protection applied and authenticated readback verified for both main branches.
  Next: targeted review of final authority/doc corrections, then local delivery.

## Review and exit

High-risk boundary change: two independent GPT-6.1-Sol/high reviewers, separate
security/correctness and architecture/compatibility scopes. No self-approval or
GitHub review impersonation. Budget: at most7launches,1initialwave,4targetedwaves,
1integrationwave,4fixbatches,60minutes session,30minutes per reviewer.
Ledger:2reviewer launches/1initial wave,2accepted P2 findings,1fix batch complete (25acceptance regressions pass).
 Security refreshes final PR/review/role snapshot; compatibility corrects
publisher stop/resume docs. Next:1targeted review of both deltas. No source pushed.
GitHub rules require1current approval+strict canonical CI, including admins.
CODEOWNERS is local; named owner selection takes effect after human merge.
Exit: regression tests cover changed policy/no-op CI and exact outbound AI bytes;
current state/evidence links are valid; live main protection requires human approval
and canonical passing CI without admin bypass; source changes independently reviewed.

## Remaining limits and next product work

No live AI quality/cost/provider test; no automated Community approval/publication.
Physical Windows/Linux editor/setup, typing/choosers, audible device output,
school restrictions and novice classroom use remain unverified.
Camera/scrolling world with fixed ScoreDisplay HUD is a later teaching slice,
not an active implementation instruction. Read [AI workflow](../docs/AI-WORKFLOW.md)
and [Development](../docs/DEVELOPMENT.md) before resuming.
