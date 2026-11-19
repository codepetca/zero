# Zero 0.5.81 hosted preparation — 2026-11-18

Owner authorized preparation, source push/draft PR and hosted checks only.
[Draft PR385](https://github.com/codepetca/zero/pull/385) is based on main d098d0d2f.
All 12 PR checks passed at reviewed source ae18259ca. Manual release 44447511514
and Windows 44447514534 passed at that exact source; browser 44447460456 passed.
Full hosted tests:2,557 passed, 163 skipped, 0 failed. Website/native/game/lesson/
WebFX checks passed. No merge, tag, publication, feed promotion or Store upload.

Kit/extension 0.5.81; core 0.3.0; signed Mac update build 80 advances public 79.
Canonical kit/VSIX/starter and both Portable candidates are retained in ignored
`.verification/release-081/hosted/`. Store MSIX 1.5.81.0, test-signed first run,
standalone setup/reopen/JavaFX/offline rebuild and Portable cold/warm passed.
The Windows trial used its own same-source ZIP, not the canonical Linux ZIP.
Complete canonical ZIP download/archive verification passed. Source TAR pins
and all 68 source mappings match public 0.5.80. All public 0.5.80 records stay intact.

Local Mac set `dist/candidates/release-0.5.81-965b8438e0c9/` is signed/notarized/
stapled and independently reviewed; built 0984de1e5, sealed 965b8438e0c9. Its
source-equivalent kit bytes remain distinct from the hosted canonical kit.
See [ledger](../docs/RELEASE-LEDGER.md#zero-0581-preparation--2026-11-18) and
[evidence](../docs/EVIDENCE.md) for exact source, hashes, run links and limits.

Next: verify the handoff-only PR head checks and retain the draft for owner review.
Merge/publication/Store submission need separate authorization. Exact promoted
Portable ZIP Windows trial and live download/feed checks remain publication gates.
Physical school devices, authenticated Pages upload and live updater are untested.
Report a problem stays with “Design an Always-On Improvement Loop”. Preserve the
separate Zero Dev watcher, earlier sealed candidates and original dirty checkout.
