# Zero 0.5.81 publication — 2026-11-18

Owner explicitly authorized merging and publishing downloads and Microsoft Store.
[Source PR385](https://github.com/codepetca/zero/pull/385) merged at b61d160d3 after
all 12 final-head checks passed. Canonical manual run 44447511514 at reviewed
ancestor ae18259ca supplies the exact kit/starter/VSIX and both Portable assets;
packaged inputs match merged main. Kit/core versions are0.5.81/0.3.0.

GitHub kit, signed/notarized Mac, both Portable releases and all corresponding
sources are public. Every draft and anonymous public asset was downloaded and
its exact size/hash verified; all 68 source mappings pass. Earlier0.5.80 bytes
remain immutable. [Kit/Portable metadata PR387](https://github.com/codepetca/zero/pull/387)
is running normal CI, including the exact canonical complete-ZIP Windows trial.
This branch adds reviewed Mac/feed/snapshots and the new published-kit test pins.
The website and signed feed still need their promotion/deployment read-back.

Mac update build 80 advances 79 with the same key; sealed candidate965b8438e0c9,
built0984de1e5. Independent Sol/high metadata review at 23baa99fa and targeted
fixture review 35e2977e7 are clean. Local config/typecheck,868 website tests
(3 skipped), build, bundle audit and runtime checks pass.

Store submission 16 (1152921505702445603), package 1.5.81.0, is in certification.
It publishes automatically as soon as approved. Submission 15/ 0.5.80 remains live;
do not claim 0.5.81 is available in Store yet. Authentication is complete.

Next: finish/merge metadata PRs under existing authorization, verify actual live
Mac/Portable links and signed feed, then recheck Store state if still pending.
See [ledger](../docs/RELEASE-LEDGER.md#zero-0581--2026-11-18) and
[evidence](../docs/EVIDENCE.md). Report a problem stays in its separate chat.
Preserve the original dirty checkout, Zero Dev watcher and sealed candidates.
