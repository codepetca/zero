# Project-owned library bundle: disposable experiment

This is a local fixture, not Zero's Add/update/revert implementation or trusted
checker. `proof.py` creates a Java score library, compiles its actual binary JAR,
packages its source JAR and POM, and includes a complete MIT license. Its manifest
records exact byte sizes and SHA-256 hashes. The test retains fixture metadata
independently in memory as stand-in accepted metadata; this is not authenticated
checker evidence. The class has no library resources or transitive dependencies.
No GitHub, registry, or library-host operation is performed.

The program commits one Zero app, framework sources, build inputs and an
experimental web bridge into a disposable student Git repository, clones it
into a different path, deletes the original and creator source, and verifies
every saved file against the independent fixture manifest. It rejects modified and missing
JAR, sources, POM and license, and a modified JAR accompanied by a rewritten
manifest. It then copies a pre-existing third-party Maven cache into a disposable
cache, clears the fixture coordinate, seeds that coordinate with the verified
project files, and compares seeded hashes. Maven 3.9.11 compiles with `-o`; a
real JVM runs a separate native harness that calls the compiled app’s own
`scoreLabel()` method, checks `Score: 11`, and asserts the loaded library
class came from the seeded JAR. Offline mode blocks Maven network access;
there is no configured library host or creator server to contact. This is native
JVM execution, not JavaFX window or physical interaction testing.

With `--web`, a scratch web project is copied from that same fresh clone. Its
committed experimental bridge removes the native Maven pin and copies the
verified saved source JAR’s single source entry byte-for-byte into the scratch
project. The app and framework source bytes are checked against the clone. The real Zero WebFX exporter compiles that project
with the existing WebFX cache. This bypasses the existing installed-library
resolver, which does not support project-owned bundles. The web build may use
network for third-party tooling; it does not contact a library host. With
`--browser`, a temporary local HTTP server serves the generated output under
`/student/game/`; the existing Playwright CLI opens Chrome and checks its
snapshot for `Score: 11`. The browser result demonstrates execution of the
compiled library behavior, separate from exporter compilation.

Run on the prepared macOS development machine:

```sh
python3 prototypes/project-owned-bundle/proof.py
python3 prototypes/project-owned-bundle/proof.py --web --browser
```

Requires JDK 17+, Git, the existing Maven 3.9.11 wrapper distribution and warm
`~/.m2/repository`, and macOS `cp -cR` for a disposable cache clone. The web
run additionally needs this checkout's exporter dependencies (`NODE_PATH` may
be set to a compatible installation), a warm `~/.cache/zero/web-export`, Node,
and Chrome and the existing Playwright CLI for the browser check. Cache contents,
JDK, Maven, WebFX and third-party plugins are not included in the saved bundle;
this does not establish an empty third-party cache, full offline web build,
Windows/Linux behavior, or longevity of external tools. The temporary repository,
cache, server and browser session are removed on normal completion.

The verifier deliberately handles one fixed, locally created fixture and fixed
archive entry. It is not a secure general-purpose archive or manifest parser,
and does not demonstrate real accepted provenance, licensing of arbitrary
contributions, archive import/export, resource handling, transactions,
interruption recovery, update/revert or product integration. Hashes alone do not
establish safety or independent authority.

Observed on 2026-11-02 at Zero source base `f76d931e`: offline Maven compile
and JVM behavior passed; the WebFX build and Chrome nested-path snapshot both
passed with the warm local caches. Chrome reported one unrelated 404 for the
server-root `/favicon.ico`; the score label rendered. The same cloned app and framework are used in both lanes; the browser lane
ran after the rewritten-manifest negative.
