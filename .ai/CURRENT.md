# Zero 0.5.81 released — 2026-11-18

Owner-authorized merge and download/Store publication are complete. Source
[PR385](https://github.com/codepetca/zero/pull/385) merged b61d160d3; kit/Portable
[PR387](https://github.com/codepetca/zero/pull/387) merged 2e71daf03; Mac/feed
[PR388](https://github.com/codepetca/zero/pull/388) merged c0bdc9380. All required
checks passed. Kit/extension 0.5.81, core 0.3.0, signed Mac update build 80.

Public kit/starter/VSIX, notarized Mac and both Portable downloads match the
reviewed bytes. All draft and anonymous public assets, including corresponding
sources, passed size/hash checks; all 68 source mappings pass. Exact published
complete ZIP passed hosted Windows cold/warm trial 44457509540. Live homepage/
Downloads links and the exact signed appcast were verified at 04:38UTC Nov19
(Nov18 America/Toronto): Mac 0.5.81 hash 06ff83d7…, feed 1179bytes/feba5d35…, build 80;
Ed25519 feed and DMG signatures verified. Receipt is ignored under
`.verification/release-081-publication/` in the publication worktree.

Microsoft Partner Center confirms submission 16 is live in Store: Zero Studio
0.5.81, package 1.5.81.0 x64. The original unsigned package and separately
test-signed installation/first-run receipts remain distinct. No credentials or
MFA codes are retained in Git. All previous public versions remain immutable.

There is no remaining 0.5.81 rollout action. Report a problem remains proposed
and belongs to “Design an Always-On Improvement Loop”. Future distribution work
needs a new local version; do not rebuild/replace published 0.5.81. Continue
routine iteration through Zero Dev. Physical school devices, authenticated Pages
upload and interactive updater delivery remain untested. Preserve original dirty
checkout, Zero Dev watcher and useful release artifacts. See [ledger](../docs/RELEASE-LEDGER.md#zero-0581--2026-11-18)
and [evidence](../docs/EVIDENCE.md) for exact artifact/source/review records.
