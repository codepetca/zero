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

Only exact reviewed `SketchApp` and `SpriteAnimation` helper profiles receive
internal overlays. CRLF and LF are equivalent. Modified helpers stop export with
an actionable error; reviewing/updating the profile is deliberate maintenance.
Image loading becomes a manifest-driven preload before student setup, with
progress, individual failures, a 30-second named timeout and original dimension
validation. Browser focus loss clears input and latches one unfocused frame even
if requestAnimationFrame was suspended. Canvas accessible text becomes a browser
ARIA label.

The audio bridge implements the bounded JavaFX Media/MediaPlayer/AudioClip calls
used by the frozen JavaFX-audio Sky Hop fixture. It uses browser audio elements,
retains pause/reset/mute/loop/error/close behavior, pauses immediately on window
blur or document hiding, and disposes on page exit. Autoplay rejection displays a
click/key instruction and retries requested playback during the next gesture.
Each effect has one cached voice; retriggering restarts it. Unsupported audio APIs
fail compilation. Newer `zero.Music`/`zero.Sound` sources are a separate profile,
not verified by this adapter revision.

Run `node --test extension/test/web-export-adapters.test.js`. The profile test
intentionally fails if the canonical adapted helper changes. Actual browser
acceptance additionally needs a real compiler build, input/audio interaction,
focus-loss, missing-resource and autoplay-denial checks. Unit/source checks do
not establish browser compatibility. The initial acceptance receipt lives in the
ignored `.verification/web-adapters/receipt.json`; Safari, Firefox, Windows and
physical tab/window switching require separate checks.
