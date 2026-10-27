# Bundled Java isolation — implemented locally

Branch codex/bundled-java, base9b030d24; reviewed source94c2cac9.
Owner requested Zero use its bundled Java without changing students' system Java
or settings. Native Run/browser builds select verified private Java21 explicitly;
old editor processes recover current selection from native identity/kit receipt.
Zero-only terminals/settings are repaired; ordinary/manual installations retain
their own tools. BOM/JSONC preferences and invalid existing files are preserved.

Verification:96focused JS/dev tests,357Mac native assertions,2238Windows wrapper
checks+updater; full initial1365pass/3skip reused for unchanged boundaries. Real
Temurin21 starter20-source compile (release17), runtime selection, zsh-f oldrc
isolation and old-editor handoff checks pass. Independent complete initial review
plus2targeted turns clean at94c2cac9 after2fixbatches. No further code changes.
Evidence:docs/EVIDENCE.md and ignored .verification/bundled-java/.

No push/PR/merge/installer release. Next publication needs owner authorization
and current CI/release gates. Keep this task worktree for review; primary funding
work and other active worktrees are untouched. Mac53 sealed assets, Windows21/
manualkit17 and productionZeroJams hold remain unchanged. Physical Windows,
fresh-device/school-network and actual VSCode terminal/update UI untested.
