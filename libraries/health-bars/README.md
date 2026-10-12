# Health bar samples

`HealthBar` and `SegmentedHealthBar` are maintained ordinary JavaFX components
in `zero.healthbars`. Main owns health, damage, healing and reset rules; the
components present explicit `setHealth` updates. They remain a separate sample
library, with no additions to the core framework.

The local unpublished coordinate is `ca.codepet.zero:health-bars:0.1.0`, targeting
Java 17 and pinned JavaFX 21.0.12. See [HealthBar API](docs/HealthBar.md) and
[SegmentedHealthBar API](docs/SegmentedHealthBar.md). Four examples reuse the
components in adventure and study apps using the existing Zero framework.

From the Zero repository, run:

```sh
python3 scripts/verify-health-bars.py
```

The proof builds in an ignored disposable directory with an isolated Maven cache,
runs the six original component tests, verifies packaged MIT notices and sources,
and runs all four finite native examples against the installed JAR. It also
checks that the tests reject an integer-division regression. A graphical JavaFX
session is required. Existing evidence paths are refused; use a fresh `--output`
for another run. Optional `--cache-from` copies trusted cached dependencies.
Synthetic actions cover damage, healing, exhaustion and reset; physical input,
novice use and Windows/Linux native desktops remain untested.

Original code is [MIT licensed](LICENSE). [PROVENANCE.json](PROVENANCE.json)
records the source repository, exact imported revision and original source hashes.
The proof does not publish, upload or change personal caches.
