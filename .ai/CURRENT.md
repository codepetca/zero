# Student version control — local work in progress, 2026-11-05

Scope and phases: [version-control plan](../docs/VERSION-CONTROL-PLAN.md). Worktree
`codex/finished-change-history`, based on origin/main 7291c2a9e; primary checkout
has unrelated changes and remains untouched. Project/Files labels and Project header
menu are implemented. Compact branch actions and read-only review/history tab are
local prototypes. Merge records use a provisional two-parent Git marker and pending
ref; guided recovery preserves newer work and asks before a retry push. This path
still needs independent review and native acceptance. Whole-change undo and the two-active-branch experience remain future work.

Owner directed “Override stops and get this work done” on 2026-11-05; under
override-task-stops this waives low-usage and workflow review-budget stops for this
task. Review ledger: 0 launches, 0 review waves, 0 fix batches. Actual provider
execution limits and publication permissions remain in force. Usage reports
ordinaryUsageAllowed=false; do not consume a reset or switch accounts. No independent
review, native editor acceptance, live GitHub trial, source push, merge or release.
Do not treat local tests as acceptance. Focused sidebar checks passed 43/43; the final Git workflow suite passed 37/37. Next:
obtain the required
risk-matched independent review when permitted, then run relevant integration and
native UI checks. Preserve uncommitted changes in this worktree.

---

# Microsoft Store package correction — 2026-10-28

Owner authorizes correcting the Store package and validating actual MSIX behavior;
coordinator Sol High, suitable bounded work/review Terra Medium or High. Keep
beginner guide and ZeroJams held. Public Mac/Windows preview/kit0.5.55 and updated
tutorials/templates are released; PRs223,224,226 merged. Store upload0.5.55 failed
with generic transfer/processing errors, not a specific validation diagnosis.

Audit found actual manifest version0.5.55.0 violates documented Store positive-major
requirements, despite Windows SDK packing/unpacking and exact archive/block hashes
passing. Existing Windows install/JavaFX receipts exercised EXE, not MSIX. Assigned
identity/publisher match Partner Center. Package remains unsigned and uncertified.

Branch codex/store-package-version starts from main5cddd93d (license PR227,
next local kit0.5.56 already prepared there). Map product major+1 for Store
versions:0.5.56→1.5.56.0,1.0.0→2.0.0.0; enforce upper bound and ordering tests.
Do not overwrite prior artifacts. No new Mac release is part of this correction.

In progress: real disposable Windows MSIX installation check, independently
reviewed source, required CI and new source-bound candidate. Keep original unsigned
candidate immutable; any ephemeral test signing uses a separate copy only in a
throwaway hosted runner. Store certification, physical Windows/school acceptance
and Store-delivered upgrades remain distinct. No final certification submission
without explicit user instruction.
