# Zero 0.5.65 release — 2026-11-08

The [kit release](https://github.com/codepetca/zero/releases/tag/v0.5.65) and
[Mac setup release](https://github.com/codepetca/zero/releases/tag/setup-v0.5.65)
are public. The reviewed source is `3b72e60d2540cc54ea2ab2aa3347fc3c204d7a4a`;
Mac preparation is `97497a42e272c8a639599078ea861f83795df82e`. Release
preparation run `42493884105`, Windows run `42493884091`, and browser run
`42493884292` succeeded. Independent Sol/high reviews passed after fixes,
including the fail-closed CI repair. Promotion PR #292 merged as
`5a5cb0f8cb4cde70f58f9ad5e4386aa2d40bfa5f`.

All three public kit assets and the Mac DMG were downloaded anonymously and
matched their recorded SHA256 values. Mac notarization submission
`3e4d1613-733c-4f48-a306-3cccf61674d7` was accepted. The live appcast SHA256
was `2101eb17ae2763406f5b39e2f03f38b93ded3b2e26ab15dab0ac764f78e2be08`;
`npm run release:publish -- --version 0.5.65 --verify-only` passed, including
live platform download checks. Physical Windows and fresh-machine installs remain
untested. Sidebar commit undo/restore is unavailable. Packaging tooling's npm
audit reported 7 high and 3 moderate vulnerabilities outside the shipped bundle.

---

# Student version control — local implementation, 2026-11-05

Worktree `codex/finished-change-history`, based on 7291c2a9e, contains Project and
Files panes, Project header New/Clone/Open, compact branch controls, review and
history views, durable named merge boundaries, and guarded preview-first undo.
Undo stages a correction on the selected branch without upload; conflicts and
unsupported project configurations stop before application. The two-active-
branch experience remains future work. Primary checkout edits are untouched.

Owner directed “Override stops and get this work done”; low-usage and workflow
review-budget stops are waived for this task. No reset, account change, push,
merge or publication is authorized. Initial independent reviews found Git retry
and history issues; fixes passed targeted re-review. Undo safety and UI reviews
found Windows configuration and selection/workspace issues; fixes passed targeted
re-review. Cumulative integration review of 7291c2a9e..580733cc2 passed 31/31
focused checks with no actionable findings. Requested reviewer configurations:
Terra/high and Sol/high; effective model, time and tokens unavailable.

`npm test` at 0c3d5afb4:1780 passed,8 skipped; final undo/history/UI tests at
580733cc2:26/26; final integration checks:31/31. `npm run check` and `git diff
--check` passed. Actual VS Code interaction remains unverified: the Mac was unlocked and the owner
foregrounded the disposable test window, but computer control selected a different
VS Code process. A disposable local Git project successfully previewed and staged
an undo with HEAD unchanged; no network was used. Physical Windows and
authenticated live GitHub flows remain untested. Zero Dev watcher is running.
Next: native editor walkthrough when the correct process can be selected. Source
publication and release remain separately unauthorized.

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
