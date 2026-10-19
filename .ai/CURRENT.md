# Mac 0.5.21 release — 2026-10-19

Owner explicitly authorized releasing a new Mac installer containing the merged
publishing-kit upgrade fix. Owned worktree: student-friction/zero; branch
codex/mac-0.5.21-publication from merged source30c9959. Preserve the dirty primary checkout,
other task's unmerged popup preview, existing profiles and student repositories.

Version 0.5.21/build21 preparation PR109 merged after all5CI checks and clean
Sol/medium review. Signed installer built from clean30c9959; Apple accepted
5c09ad6b-0a74-44d3-a2a0-d7fa31097a8b. Staple and actual DMG/app Gatekeeper passed.
Measured DMG4580453bytes, SHA25684617473283db5303ec2e8529d0effec17eb4efee515c8bc62c584520af1d8e6.
Next seal signed feed/candidate and run independent artifact/metadata review. Keep public 0.5.20 installer/feed and published-kit
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
