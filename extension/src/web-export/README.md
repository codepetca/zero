# Local browser export engine

`require('./web-export').exportForWeb({ projectRoot, cacheRoot, env, signal,
onProgress })` builds a trusted, saved Zero project and returns `sitePath`,
`zipPath`, `manifestPath`, `buildId`, `sourceHash`, `totalBytes`, `files` and
`logPath`. Progress is a string; `signal` is an AbortSignal. `env` can select
Zero's installed JDK through `JAVA_HOME`. The CLI is
`node scripts/export-web.mjs /path/to/project --cache /path/to/cache`.

The engine uses Node built-ins and the project's pinned Maven wrapper. It does
not use a global Maven installation, global Maven settings, WebFX CLI, npm or
account credentials. The entire `web-export` directory (including adapters,
templates, lock and notices) is portable as a CommonJS module. The first build
downloads the compiler; subsequent builds reuse the private cache.

Only `src/main/java` and ordinary, visible application files in
`src/main/resources` are considered. `.gitkeep` is excluded. Escaping or internal
source symlinks, hidden/private resources and unsupported Maven dependencies fail
with a useful error. Framework adapter profiles are fingerprint checked. The
engine never changes Java or resources. It adds only the narrow
`/.zero/web-export/` Git ignore rule when missing.

Generated projects, Maven settings, dependency cache and diagnostic logs live
outside the student project. Every build starts in a new directory. Its generated
project and full Maven target are removed after success, failure or cancellation.
Only the latest diagnostic log for each project remains at
`cache/logs/<project-path-sha256>.log`; returned results and errors point there.
Shared Maven dependencies and historical unrelated cache folders are preserved. Only a real
successful Maven exit and complete fresh GWT output can replace the previous
export at `.zero/web-export`. The optional `outputRoot` must be that exact path.
Replacement uses staging and rollback; additional user files in the previous
export stop replacement. A per-project lock prevents overlapping exports within
the same configured cache, and cancellation terminates the Maven process tree.

`site/index.html` and `web-export.zip` use relative links and support hosting in a
nested repository path. The ZIP has `index.html` at its root. The manifest records
original input hashes, source mapping, adaptations, output hashes, exact locked
WebFX coordinates and checksums, and an inventory of cached Maven JAR/POM hashes
(the inventory may include artifacts reused by other exports). All fixed WebFX
source JARs and runtime license terms accompany the site under `licenses/`.

The Maven project has no WebFX parent or floating snapshot dependency resolution.
It passes exact checksum-verified timestamp source JARs directly to GWT; support
artifacts and build plugins have fixed release versions. See `toolchain-lock.json`
for the immutable upstream inputs. Windows command construction is tested with
spaces and rejected shell expansion characters; real Windows interactive export
still needs platform verification.

The pinned upstream WebFX mouse adapter swaps the middle and secondary DOM button
masks. A generated GWT super-source corrects those two constants; the exact
original/patch hashes are recorded in the toolchain lock, and the patched source
accompanies the site under `licenses/sources/overrides/FxEvents.java`.

The reviewed GameApp overlay also installs `BrowserGameViewport`. Its JavaFX
transform fits the complete fixed logical content (including padding/controls)
inside the scene, with aspect-preserving downscaling and centering. Native helper
sources and ordinary App scene creation are unchanged. Input passes through
`canvas.sceneToLocal`, so scaled DOM hit testing and Java coordinates agree.
The adapter reconstructs scene coordinates from the stable JavaFX pick result;
this avoids a pinned WebFX derived-event copy applying local coordinates twice
after a click or touch release.
Only the canvas owns touch capture; cancellation emits a normal pointer release
before clearing input, and shutdown removes the owned listeners. This runtime
filters nonprimary touch events before WebFX's scene-level ancestor exit handlers,
so an extra finger cannot move the primary pointer during or after its release.
Ordinary App views do not install the filter. The runtime
is included in the existing exporter profile hash, so old exports require a
rebuild. `verify:web` covers landscape and padded portrait games with real Chrome
touch dispatch; synthetic lifecycle checks are labeled separately in the receipt.
