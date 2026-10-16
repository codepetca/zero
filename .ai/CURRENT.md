# Current state — Tutorial Summary refinement, 2026-10-16

Owner requested removal of the entire First time card and every continuation card
containing If you have not started it yet. This refines the website cleanup
published through PR71/e268b93 under the current publication workflow. Branch
codex/tutorial-remove-project-hints owns this refinement; original funding and
other active worktrees remain untouched.0.5.17 release files remain unchanged.

Document removes the generic help wrapper/content and empty continuation sections.
Start project buttons remain only at lessons0/3/8. Lesson10 component reminder and
lesson12 optional assets remain as small muted,unboxed notes. Canonical lesson
instructions,Next/sidebar,sticky API names and transparent scrollbars are unchanged.
Owner also requested opening actions/Done in a Summary card, illustration beside
on desktop/below on phones, and removal of the redundant short description label.
Renderer/CSS implement this without changing authored source; all13 render tests
verify grouping.96website tests/typecheck/build pass. Prior review turn interrupted
for owner steering; one complete review resumes on the new fixed head. Draft PR72
owns both refinements. Continuing design/product defaults are updated.

Next: local website checks/browser confirmation,one bounded independent review,
then PR/exact-headCI/merge and live verification through the existing publication
flow. Preserve .verification/tutorial-card-removal/ receipts. Prior PR71 acceptance
and platform limits remain recorded in docs/EVIDENCE.md and docs/VERIFICATION.md.
