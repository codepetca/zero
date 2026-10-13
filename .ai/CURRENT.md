# Current state — fresh local lesson projects

Updated 2026-10-13. Coordinator worktree:
`/Users/stew/.codex/worktrees/github-sharing-adoption/zero`.
Read design.md, PRODUCT.md, DEVELOPMENT.md and UI-UX-GUIDELINES.md.

Owner selected option 2: Start lesson, fresh local projects, no switching chores,
one-click rerun, sample practice kept off GitHub. Source PR/main merge and website
deployment are authorized in this task. Frozen published 0.5.8 assets stay unchanged;
the new editor command has an unpublished local VSIX candidate, not a kit release.

[PR #37](https://github.com/codepetca/zero/pull/37) merged at 5fade4f after a full
65-file Sol/high review and a targeted two-file review. Both low-severity findings
were fixed. Exact-head CI 38451438023 passed. Production served 13 Start lesson
controls and 18 ZIPs; full source/resource bytes, local markers and wrapper mode
0755 were verified. [PR #38](https://github.com/codepetca/zero/pull/38) makes stage
ZIP URLs usable in local Markdown while preserving same-origin web downloads.
Inspect its final review, CI and merge state; unchanged editor/source coverage
is retained from PR #37.

One generator supplies 13 lessons plus five stages. Native creation never replaces
existing folders and rejects all open Zero roots and Git ancestors. Local markers,
all-files Git ignore, disabled workspace Git and command/service guards block
Zero publication of practice projects. Own student game workflows are unchanged.
Lessons say Start lesson → open fresh folder → Run App; rerun is Run App again.

Verification: all 18 generated projects compiled; root 254 passed with 1 optional
PowerShell skip; website 56, sharing 45 and generator 5 passed, as did typecheck,
build, configuration and diff checks. Browser checks covered 1280/320/390px,
light/dark, lesson selection, keyboard downloads and disclosures. Native folder
creation and commands use real temporary folders and a mocked VS Code host.
Native click-through is unverified: the connector selected an unrelated window,
then the Mac locked. WebKit, 200% text/400% zoom, physical Windows and student
trials remain pending. Detailed history is in EVIDENCE.md, VERIFICATION.md and
ignored local-lessons receipts.

Generic library executor acceptance remains held after provider rejection;
general game publication stays disabled. Neon resources are retained. DeepSeek
is paused. Full adoption is not complete merely because this feature landed.
