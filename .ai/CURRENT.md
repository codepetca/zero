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

Owner authorized implementing Lesson 12, publishing PR21 and merging it; the
latest instruction is to retry the merge. No new release, credential change or
branch-policy change is authorized here. Owner removed protections separately;
normal GitHub merge remains subject to passing checks and independent source review.
AI workflow hardening from [PR20](https://github.com/codepetca/zero/pull/20) is
merged at `1f2fd53`; its reviewed policy and compact recovery docs are preserved.

## Execution and acceptance

- Managed worktree: `codex/lesson-12-game`, implementation `8c9896d`, previous
  final head `944ddfe`, current main integration base `1f2fd53`.
- Lesson12 includes media, scrolling camera/fixed ScoreDisplay, platforms and
  gravity, enemies/two levels, and a complete win/lose/restart game. Ordinary Java
  framework, dependencies and immutable published release bytes remain unchanged.
- Original independent GPT-6.1-Sol/high review covered all46files, no blockers.
  Local native, ZIP, browser and website checks passed; original-head Linux CI
  [38101600157](https://github.com/codepetca/zero/actions/runs/38101600157) passed.
- Main integration conflicts only in CURRENT and VERIFICATION; retain compact
  main guidance and archive Lesson12 phase detail. Review the documentation delta
  and verify final-head CI before merging [PR21](https://github.com/codepetca/zero/pull/21).
- Primary funding work and other managed checkouts remain untouched. One writer
  per component. DeepSeek remains paused through2026-12-31. Usage/token telemetry
  is unknown for this retry; the prior weekly23% remaining was account-wide.
- [Lesson12 phase evidence](../docs/history/lesson12-through-2026-10-10.md),
  [delivery index](../docs/EVIDENCE.md), and [verification](../docs/VERIFICATION.md)
  retain review/check scope. No new implementation wave is planned.

## Remaining limits and next action

No live AI provider or automatic Community approval. Physical Windows/Linux
editor/setup, typing/choosers, audible device output, school restrictions and
novice classroom use remain unverified; Linux virtual-display CI is verified.
Next: finish documentation integration, verify current-head checks/review, merge
PR21 normally and verify merged state. Published0.5.3 does not contain the new
full-game stages; a new kit release requires separate authorization.
Read [AI workflow](../docs/AI-WORKFLOW.md) and [Development](../docs/DEVELOPMENT.md)
before resuming. Historical permissions are not standing grants.
