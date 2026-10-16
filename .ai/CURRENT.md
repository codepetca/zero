# Current state — Website publication, 2026-10-16

Owner explicitly authorized publication of this chat's website changes. Branch
codex/tutorial-reading-cleanup integrates origin/main e8e25cc (published0.5.17
metadata) while preserving release bytes, downloads and signed update feed.
Original dirty funding checkout and active web-export/release worktrees remain
untouched. Other unpublished browser/sidebar work is excluded.

Tutorials omit Previous prose and horizontal dividers, highlight numbered step
headings and mute secondary setup/continuation hints in helper cards. Docs sticks
method names within their entries instead of category banners. Transparent
scrollbar tracks and thin gray thumbs follow the shared light/dark/system theme.
Continuing owner preferences are saved in design.md and referenced by AGENTS.md.

Prior local acceptance:96website tests,10design tests,typecheck/build and browser
light/dark,narrow/desktop,anchors,keyboard disclosure/focus checks; three complete
bounded Luna/medium implementation reviews found no actionable issues. Safari,
physical platforms,enlarged text and forced-color UI were not newly verified.
Two unrelated updater tracing warnings remain. Full evidence:docs/EVIDENCE.md,
docs/VERIFICATION.md and ignored .verification/tutorial-cleanup/.

Next: rerun affected checks on current-main integration, one bounded complete
integration review, draft PR and exact-head CI, then merge under this authority
and verify production deployment/live pages. No binary release rebuild or account
changes. Retain all private/ignored evidence during worktree cleanup.
