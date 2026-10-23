# Animated Actor stress demo

Choose **100**, **250**, **500**, **1000**, **2000** or **5000 actors**. Every actor has a 32 × 32
sprite, four animation frames at 8 animation fps, its own animation clock,
movement and 35-degree-per-second rotation. The original 128 × 32 pixel-art
fixture is included under this repository's MIT license. All actors share the
cached image. No collision detection or physics is included in this workload.

The live **FPS** label measures completed game frames per real second. Average
and worst frame intervals update about once per second. These are frame-cadence
measurements, not CPU/GPU rendering duration. Movement uses update(seconds), but
metrics use System.currentTimeMillis so GameApp's capped movement delta cannot
hide slow frames. Changing workload resets actors and measurements. A backward
wall-clock adjustment resets the sample. Animation fps and game FPS are separate:
an eight-fps sprite can be moved and drawn by a sixty-fps game.

Assemble with `node scripts/prepare-ui-prototypes.mjs`. Open
`.verification/ui-prototypes/actor-stress` in Zero, or run its included
`./mvnw javafx:run` (`mvnw.cmd javafx:run` on Windows). The project contains its own
readable Zero sources, two student Java classes, artwork and pinned build files.
Native control/FPS functionality is checked by `node scripts/verify-ui-prototypes.mjs`.

For an actual pinned WebFX build, run `node scripts/verify-actor-stress.mjs --build`.
Add `--large` to build and measure the 1000/2000/5000 workload range:
`node scripts/verify-actor-stress.mjs --build --large`, then
`node scripts/verify-actor-stress.mjs --measure --large` during a quiet window.
Large-range evidence is saved separately in `.verification/actor-stress-web-large/`
so the earlier 100/250/500 measurements remain available.
The default cache is local to this checkout; an existing verified cache can be
selected with the optional ZERO_STRESS_CACHE_ROOT environment variable.
Once other builds and tests have stopped, run
`node scripts/verify-actor-stress.mjs --measure`. The browser runner checks actual
sprite counts and frame changes before measuring. Performance instrumentation
then records one game-frame timestamp per clearRect and browser animation-frame
timestamps, without retaining the per-sprite validation hooks.

Two passes run in ascending and descending order. Each of the six samples has a
three-second warmup and ten-second measurement. Ignored receipts and raw samples
are in `.verification/actor-stress-web/`. Compare average FPS, p95 frame interval
and long gaps; a display's refresh rate can cap FPS. Hidden/throttled tabs and
other work distort results. These automated Chrome measurements describe this
machine and browser, not a guarantee for school laptops or phones. The live demo
lets others try their own device. A stable result through the largest tested
count means this workload has not established a slowdown threshold; it does not
prove unlimited capacity. Low FPS is a measured outcome, not a failed performance
test. Incorrect sprite counts, runtime errors or invalid evidence still fail checks.
