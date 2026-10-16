# Current state — Tutorial and Docs reading cleanup, 2026-10-16

Owner requested removal of Previous links and tutorial dividers, clearer step
headings and muted secondary hints. Local implementation is complete in the
attached tutorial-reading-cleanup worktree, based on main e7b9b4d. Original funding
checkout and other active worktrees are preserved. No push, PR, merge or deployment
is authorized by this request; no release/account changes were made.

Renderer removes introductory Previous prose and lesson thematic rules while
preserving code/source documents. Existing light/dark surfaces highlight numbered
step headings; smaller helper cards contain setup/continuation/optional hints.
Tutorial section and pagination borders are removed. Sidebar, Next, anchors,
default-open disclosures and code copying remain available.

96 website tests, typecheck, production build and browser checks pass; one complete
Luna/medium independent review found no actionable issues. Two unrelated updater
tracing warnings remain. Safari/physical devices/enlarged text were not tested.
Full delivery/review evidence: docs/EVIDENCE.md and docs/VERIFICATION.md.
Screenshots/logs are ignored under .verification/tutorial-cleanup/.
Docs follow-up is locally complete: category headings scroll normally and method
name rows stick within their article, below the desktop header or at phone top0.
Typecheck/build/96tests pass; complete Luna/medium review found no actionable
issues. Browser checks cover light/dark,320/384/1280px and scroll handoff.
Scrollbar follow-up is complete: root follows the shared theme; page/sidebar/code
tracks blend into their backgrounds with thin gray thumbs.10design tests and
website typecheck/build pass; Luna/medium complete review clean. Both themes and
scrolling checked in-app; Safari/physical/forced-color UI remain untested.
Local previews: http://127.0.0.1:3216/tutorials/8 and /docs#circle.
Next action, if requested: publish through the repository's reviewed PR workflow.
