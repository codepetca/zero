# Direct Zero GitHub sign-in — 2026-10-22

Owner requested removing VS Code's redundant request for Zero to access its own
Zero GitHub provider. Branch codex/direct-zero-sign-in now has owner authorization for PR and merge
after tests/reviews/CI pass; no installer release is requested. Zero calls its owned provider via
the existing guarded facade. Keep device authorization, SecretStorage, Accounts
registration, third-party host consent and session/account drift checks intact.
Full local suite passed997tests with3platform skips; npm run check passed.
Both independent authentication reviews are complete/clean at88781454. Source Dev
recognized its saved session without host confirmation. First-time native GUI
acceptance remains unverified; actual provider/facade device-flow tests pass.
Exact-head CI gates the authorized PR/merge. Current external receipt is kept
in ignored .verification/direct-auth/progress.json; tracked review evidence is
in docs/EVIDENCE.md.

Faster CI PR174 merged0aad1481edf88cdb6deceeb0cf7999293b0ff43c after all11checks
passed; live UI-only PR175 completed in128seconds, then closed unmerged. Cold/warm
cache, browser and run-isolation evidence passed. See docs/FAST-DEV-FLOW.md and
docs/EVIDENCE.md. Zero Dev PR173 is also merged; default to its source loop.

Keep active tutorial-padding worktree and ~/.zero-dev/fce53b51730d/ profiles:
they own the scratch game, watcher and preview3153. Preserve scratch edits and
the unrelated dirty primary funding checkout. No installer build is needed.

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
