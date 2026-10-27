# Bundled Java isolation — local implementation

Task branch codex/bundled-java, base origin/main9b030d24 (Mac53 promotion).
Owner requested Zero always use its bundled Java without changing students'
system Java/settings. Scope: native launcher/settings repair, managed Run/browser
build environments, Zero-only terminal profiles and truthful setup diagnostics.
Public API, project source/build pins, global settings and credentials unchanged.

Local verification:95focused JS/dev tests,357Mac native assertions,2238Windows
wrapper checks plus updater harness; starter20-source Maven compile passes with
private Temurin21.0.12.1 and source release17. Real runtime/browser-selection and
zsh-f startup-override and old-editor handoff checks pass. Full initial regression
1365pass/3skip. Initial complete source review found3blockers; batch1 fixes old
editor environment handoff, UTF8BOM and invalid-settings preservation. Targeted
review pending. Logs in ignored .verification/bundled-java/.

Use docs/EVIDENCE.md for delivery/review receipts. No push, PR, merge or installer
release authorized by this implementation request. Mac53 sealed assets, Windows21/
manualkit17 and productionZeroJams hold remain unchanged. Preserve primary funding
work, existing student projects/profiles and all other active worktrees. Physical
Windows, fresh-device/school-network and actual VSCode terminal UI untested.
