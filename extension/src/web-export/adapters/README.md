# Browser source adapters

`adaptSources({ sources, resourcePaths })` receives Java source paths relative to
`src/main/java` and resource paths relative to `src/main/resources`. It returns
copied/adapted Java, the `zero.web.BrowserLauncher` entry class, per-file original
paths/line offsets, change notes and browser limitations. It never writes student
files. The engine must compile every returned source using the pinned WebFX/GWT
compiler and publish output only after that complete compile succeeds.

Default-package Java moves to `zero.exported` in the export copy. Ordinary game
classes otherwise retain their source. The small lexer excludes comments and
literals from class-resource, audio-import and canvas-label transformations.
Class-literal `getResource` calls resolve against the frozen resource manifest;
relative resource paths retain their original default-package meaning. The
bridge supports `URL.toExternalForm()` and `toString()`; unsupported URL, JavaFX,
reflection, file or other Java APIs fail the compiler gate.

All thirteen reviewed Zero helper sources are fingerprint-checked. Exact reviewed
`App`, `GameApp` and `SpriteAnimation` profiles receive internal overlays. CRLF and LF are equivalent. Modified helpers stop export with
an actionable error; reviewing/updating the profile is deliberate maintenance.
`Actor` stays unchanged: its ordinary movement math and calls to reviewed image
helpers need no separate runtime overlay. The reviewed `zero.Color` and
`zero.ui` sources also compile unchanged; helper identity checks use exact
recursive paths, including the UI subpackage.
Image loading becomes a manifest-driven preload before student setup, with
progress, individual failures, a 30-second named timeout and original dimension
validation. Browser focus loss clears input and latches one unfocused frame even
if requestAnimationFrame was suspended. Canvas accessible text becomes a browser
ARIA label.

The audio bridge implements the JavaFX Media/MediaPlayer/AudioClip calls used by
the unchanged reviewed `zero.Sound` and `zero.Music` helpers. It uses browser audio elements,
retains pause/reset/mute/loop/error/close behavior, pauses immediately on window
blur or document hiding, and disposes on page exit. Autoplay rejection displays a
click/key instruction and retries requested playback during the next gesture.
Effects create independent overlapping voices (up to32 active/preparing voices
per Sound; autoplay-blocked requests coalesce to one pending effect); stopped or ended voices release
their media elements. Music retains independent readiness, end/error callbacks,
actual playing status, rewind, mute and repeat state. The canonical app cache and
cleanup rules remain in the copied Java helpers. Browser page exit invokes each
owner’s stop callback in addition to disposing native media. Decode failures are
asynchronous in browsers: they retain a named error/notice; a failed Sound
reports the failure on a later play, and Music keeps its native failure guard.
Unsupported audio APIs fail compilation.

Run `node --test extension/test/web-export-adapters.test.js`. The profile test
intentionally fails if the canonical adapted helper changes. Actual browser
acceptance additionally needs a real compiler build, input/audio interaction,
focus-loss, missing-resource and autoplay-denial checks. Unit/source checks do
not establish browser compatibility. The seven-helper audio verification is in the ignored
`.verification/web-audio-integration/`; the earlier five-helper acceptance is in the
ignored `.verification/web-adapters/receipt.json`; Safari, Firefox, Windows and
physical tab/window switching require separate checks.
