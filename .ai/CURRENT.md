# Zero Dev — owner-authorized PR/merge, 2026-10-22

Owner requested fast UI/framework/game/smoke iteration without an installer.
Branch codex/zero-dev reuses the tutorial-padding checkout from origin/main
d131bd43, preserving the dirty primary funding checkout. `npm run dev` opens an
isolated source extension host, watches source and serves live preview3153.
Game edits and editor state are preserved; managed-copy drift blocks overwrite.
See docs/ZERO-DEV.md. Implementation and native-test fixes committed through
c269210bd552a659fbce2fcda71ba66e72963109; independent source and native-test
reviews completed clean after targeted fixes. Seven dev tests,21UI tests,
configuration, source refresh and browser live reload passed. Warm preparation
measured0.664s with existing dependencies. Final full dev:smoke exits0 with
ZERO_DEV_SMOKE_OK: checkpoint game, native automated three-coin win/Restart/
recollection, framework input/focus/padding/media and UI contracts pass. Native
Run/Stop/Run passed in the actual source extension host; Stop terminated Main,
Run launched it again. Restart focus assertion was also mutation-tested: removing
focus restoration fails as expected; original game restored. Automated JavaFX
input is not physical keyboard/mouse acceptance; Windows/Linux UI untested.
Keep this worktree active: it owns the Dev game, watcher and preview3153. Dev
editor state is ~/.zero-dev/fce53b51730d/, outside the checkout for Mac IPC limits.
The sample is running and local-only, with Git off and upload simulation. No
installer/version, account permission or installed Zero change. Owner now
authorizes PR publication and merge after CI. Main sync preserves Mac0.5.46
system appearance. PR173 is open; bounded integration review completed clean
at5dec75d7, and post-sync configuration,7Dev and21UI checks pass. Final CI gates
merge. No installer release is part of this request. Receipts, final logs
and rendered game-win.png: .verification/zero-dev/acceptance/.

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
