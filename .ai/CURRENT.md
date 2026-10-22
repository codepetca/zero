# Zero Dev and faster development — 2026-10-22

Zero Dev PR173 merged0d31bcfc5591298f13f5d8576f8a01a9dfc960a0 after all5checks
passed at7100b0e8. Independent implementation/native/integration reviews clean.
Full Mac native smoke, automated sample win/Restart/recollection, Run/Stop/Run,
7Dev and21UI checks passed. Physical keyboard gameplay and Windows/Linux Dev UI
remain untested. No installer release or version bump was part of this work.
Details and exact CI/review receipts: docs/EVIDENCE.md and ignored
.verification/zero-dev/acceptance/progress.json.

Owner authorized implementing faster CI, PR publication and merge after checks.
Branch codex/zero-fast-dev-flow includes the prepared/default Zero Dev guidance
and current CI implementation. Four workflows use conservative affected-code
selection, always-running final gates, PR-only superseded-run cancellation,
verified runner Chrome reuse/fallback and Maven/WebFX download caches. Native
selection exercises the sample playthrough and framework checks. Unknown/shared
inputs and manual dispatch retain the full matrix. Relevant local contract tests
and actionlint/configuration checks precede independent review; exact-head CI and
full-run/cache/cancellation evidence gate merge. No installer release requested.
See docs/FAST-DEV-FLOW.md; implementation receipts: .verification/fast-ci/.

Keep the active tutorial-padding worktree and ~/.zero-dev/fce53b51730d/ profile:
they own the user's scratch game, watcher and preview3153. Preserve scratch edits
and the unrelated dirty primary funding checkout. Never infer publication
permission for future changes from the completed PR173 authorization.

# System appearance — Mac0.5.46 publication, 2026-10-22

Owner authorized source PR/merge after CI and release after the Update popup
commit prompt chat finishes. That chat completed0.5.45/native acceptance before
this publication. Source PR171 merged0b4a2ec2 after exact-head workflow/check-suite
success; Luna/medium initial, documentation correction and main-sync reviews clean.

Signed/notarized/stapled0.5.46 is public at
https://github.com/codepetca/zero/releases/tag/setup-v0.5.46.
It includes0.5.45 tutorial/Start Page changes and system light/dark detection in
new editor settings. Existing preferences are preserved; owner current Zero
window was explicitly enabled and observed dark to match macOS Dark.
Sealed candidate mac-0.5.46-243826d36ba2 built atccf060f1; preparation243826d3.
Anonymous public DMG matches the measured candidate. Sol6.1/medium candidate
review complete/clean. Metadata and signed-feed promotion await CI/merge and
live verification; previous45 feed remains live until then. No46 install requested.
Windows21/manualkit17, older immutable assets and primary funding work preserved.
See docs/EVIDENCE.md and primary .verification/system-theme-release0.5.46/.
