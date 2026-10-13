# Current state — fresh local lesson projects

Updated 2026-10-13. Coordinator worktree:
`/Users/stew/.codex/worktrees/github-sharing-adoption/zero`.
Branch `codex/local-lesson-projects`, base main `cf7d42f`.
Read design.md, PRODUCT.md, DEVELOPMENT.md and UI-UX-GUIDELINES.md.

## Outcome and authority

Owner requested option 2: Start lesson creates a fresh project, normal lessons
have no safe switching chores, rerunning is one Run App click, sample projects
stay local and off GitHub. Prior source PR/main merge and website deployment
permission continues for this implementation. Generated student folders/ZIPs
are ignored build/runtime output; maintained teaching source remains in Zero.
Frozen published 0.5.8 assets and manifests stay unchanged. This work prepares
an unpublished VSIX candidate; it does not replace the installed released kit.

## Implementation and ownership

One shared generator supplies 13 lessons plus five game/stage variants.
Website downloads a complete ZIP; native Start lesson exclusively creates a
new folder outside Git/current-project roots and opens a new editor window.
Each practice project ignores all files in Git, disables workspace Git and is
marked local-only. Command and service guards block Zero upload/repository/
sharing actions. Existing student-owned projects retain their normal workflow.
Coordinator owns generator/build hooks/integration; two Sol/medium workers
completed disjoint editor and website/lesson changes. No live GitHub student
action, account change or student-code upload was performed.

## Verification and next

All 18 generated projects compiled. Generator5, website56, root254pass1optional
PowerShellskip, sharing45, typecheck/build/configuration/drift/diff checks passed.
Browser desktop1280,320/390px, dark/light, lesson selection, keyboard download
and stage disclosure/download checked. Downloaded ZIP bytes match the generator;
wrapper mode0755 and local marker verified. VSIX contains18 starters.
Native materialization/command guards are tested with temporary folders/mock
host. Mac UI connector selected an unrelated window, which was left unchanged;
actual native Start lesson/Run interaction remains unverified. WebKit,200%text,
400%zoom, physical Windows and student trials remain pending.
Next: independent final-head review, exact-head CI, normal merge and production
ZIP/button verification. Detailed receipts/logs stay in ignored .verification.

Generic library executor acceptance remains held after provider rejection;
general game publication remains disabled. Neon resources remain retained.
DeepSeek remains paused. Earlier sharing/release evidence lives in EVIDENCE.md
and VERIFICATION.md; full adoption is not complete merely from this feature.
