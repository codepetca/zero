# Sign-in verification and Mac0.5.47 release — 2026-10-22

Owner authorized testing Zero Dev sign-in, then releasing the update when it works.
Native acceptance passed: first prompt was Connect Zero to GitHub/device code,
without the redundant VS Code session-sharing dialog. After a deliberate cancel,
retry completed GitHub authorization as armorup; Start tutorial enabled. The saved
account persisted across Developer: Reload Window. No repository was published.

PR176 merged3589903def589af7ec083c10c847f8da075e88a7 after11CI checks and two
independent authentication reviews passed. Release0.5.47/build47 is prepared from
that clean main source in zero-sign-in-release. Keep core0.2.1, prior immutable
assets, published-kit17, Windows21 and the current signed Mac46 feed unchanged
until exact new native bytes are verified. Publish one Mac DMG; no separate kit
publication is requested. Review source/candidate, pass exact-head CI, then promote
verified download/feed metadata and verify live bytes before claiming delivery.

Preserve the tutorial-padding Dev checkout/profile/scratch game/watcher: it has
other uncommitted UI work that is excluded from this release. Preserve unrelated
primary funding work. See docs/EVIDENCE.md and ignored .verification/release47/.
