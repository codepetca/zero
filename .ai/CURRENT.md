# Mac 0.5.21 release — 2026-10-19

Owner explicitly authorized releasing a new Mac installer containing the merged
publishing-kit upgrade fix. Owned worktree: student-friction/zero; branch
codex/mac-0.5.21-release from af07403. Preserve the dirty primary checkout,
other task's unmerged popup preview, existing profiles and student repositories.

Prepare version 0.5.21/build21. Keep public 0.5.20 installer/feed and published-kit
snapshot unchanged until a new signed/notarized/stapled candidate is reviewed,
published and anonymously verified. This publishes one Mac DMG and signed feed;
no standalone kit or Windows release is requested. No new runtime edits.

Plan: review/merge version preparation; build from clean merged source; sign,
notarize and staple; seal installer/feed; independent artifact and metadata
reviews; publish exact single DMG; reviewed feed/download metadata promotion;
verify public website/feed/DMG and installed extension provenance. Existing
publishing fix reviews and Grove native/live checks remain valid.

Coordinator owns writes and release decisions. New release phase budget: up to
7 reviewer turns,4fix batches,4targeted waves,60review minutes; reviewer max30min.
Use one standard version review, then artifact/security and metadata/compatibility
reviews of concrete sealed bytes; reuse accepted source coverage. No new goal,
task or automation. DeepSeek remains paused. Details/receipts in existing
.verification/mobile-canvas/plan.json; bulky binaries/logs stay ignored.
