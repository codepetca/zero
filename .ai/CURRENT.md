# ZeroHub title info placement — 2026-10-24

Owner asks to reuse the old top-right About/question-mark position for the
availability-colored details control, rather than a separate footer info icon.
The old question mark toggled the project description. Preserve the native
popover containing description, status/time, author/version and report flag;
keep visits and borderless stars at the bottom. Existing publication authority
continues for this UI follow-up; Free-plan infrastructure/publisher pins unchanged.

PR179 metrics merged b549b959; PR180 details/visits merged6f8388bd. This branch is
codex/zerohub-header-info in the attached zerohub-interest worktree. Preserve the
dirty primary funding checkout and unrelated worktrees. Shared details are pure
presentation; render exactly one authenticated star control per card. Place the
info trigger in the heading DOM to preserve keyboard reading order.

Next: website checks, native-popover browser checks, one independent delta review,
PR/CI publication and live verification. Receipts: ignored
.verification/zerohub-header-info/. Prior delivery receipts/PRs remain available.
No new task, automation, resource, dependency or native installer release.
