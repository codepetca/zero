# Animated Actor stress demo

Choose **100**, **250**, **500**, **1000**, **2000** or **5000 actors**, and select
**32 px**, **64 px**, **128 px** or **256 px**. The size is both the actual source
frame size and the drawn square's size in canvas pixels. Four original PNG sheets
contain four animation frames each, at 8 animation fps. Their dimensions are
128 × 32, 256 × 64, 512 × 128 and 1024 × 256. Each actor has its own animation
clock, movement and 35-degree-per-second rotation. All actors at the selected
size share one cached image; changing size or count rebuilds the actors and
resets metrics. Artwork is under the repository's MIT license. No collision
detection, physics or automatic offscreen culling is included in this workload.

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
For all nine larger-size/count combinations, use
`node scripts/verify-actor-stress.mjs --build --sizes`, then
`node scripts/verify-actor-stress.mjs --measure --sizes` during a quiet window.
This uses 64/128/256-pixel frames with 1000/2000/5000 actors, then repeats the
nine combinations in reverse. Eighteen samples take about four minutes, with
the same three-second warmup and ten-second measurement per sample. Its separate
output is `.verification/actor-stress-web-sizes/`; previous results stay intact.
The matrix uses a 900 × 1100 browser viewport to fit all controls and records
the actual canvas buffer and CSS size. It verifies source sheet dimensions,
all four crop rectangles, destination size and actual sprite count before timing.
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

The size matrix increases source-image dimensions and drawn area together. Larger
sprites overlap heavily in the fixed 800 × 450 field, so it measures this combined
rendering workload, not PNG compression or isolated image-decoding speed. Assets
are loaded before measurement. The largest sheet has 1 MiB of raw RGBA pixels;
it is not duplicated for every actor. Simple repeated pixel art, transparency,
clipping and the browser's rendering strategy also affect the result. Physical
display presentation/GPU time is not measured by the frame-cadence counter.
