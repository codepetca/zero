# Download-page setup details — 2026-10-19

Owner requested moving the Mac/Windows version and requirement lines from the
Download page into its existing setup-help destination. Owned student-friction
worktree, branch codex/download-setup-details from39f67c1. Preserve unrelated
primary/profile work, student projects and all published0.5.21installer/feed bytes.

The download page keeps its two verified platform buttons and setup-help link.
The linked setup guide shows the same manifest-derived Mac/Windows details near
its title, including the Windows manual-ZIP fallback and future native Windows
case. No hardcoded versions or download URL/availability changes.

Verify website checks and local browser views, one bounded low-risk independent
review, then normal PR/CI/merge and live page/help verification. No new installer,
goal, task or automation. Mac0.5.21release was completed in PRs109/110; receipts
remain in .verification/mobile-canvas/plan.json and .verification/mac-0.5.21/.
