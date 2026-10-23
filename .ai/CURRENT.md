# PNG sprite-size stress matrix — completed locally, 2026-10-23

Owner requested 64/128/256px PNG frames ×1000/2000/5000 actors with live FPS.
Source e3c1a76a (base 8ae786b4), attached worktree
/Users/stew/.codex/worktrees/actor/zero. Local only: no push/PR/merge/deploy/release,
install, telemetry or account authority. Preserve primary funding changes and
other worktrees' Dev scratch/profile/watcher state.

Demo offers 32/64/128/256px sizes and all six count buttons. Source and destination
sizes match; four-frame 8fps PNGs share an image cache, with separate animation
clocks, movement and rotation for every actor. New assets are original MIT pixel
art. No framework/API/contract change (13 helpers/159 declarations), optimization,
asset cap or warning policy. `--sizes` isolates its project/results, keeping prior
small/large builds and receipts intact.

Native all four pass: stress895 frames/all15cases, games637/638. Root check twice,
syntax/diff and runner parse/order/sparse checks pass. One pinned WebFX build16.69s;
ID095cf516-4021-4d41-9926-d9fff6c6437e. Nine browser functional cases each verify61
frames, exact counts, real PNG/crop/destination sizes and visible HUD. Quiet serial
18 samples, 3s warm+10s measured, forward then reverse; own jobs/old IAB stopped.
Headless Chrome156, viewport900x1100, DPR1, canvas buffer/CSS800x450. Draw cadence
59.9018–60.0080FPS, p95 intervals16.8–18.2ms, max33.2ms, zero>33.3ms gaps;
10804draw/10805rAFtimestamps; UI60 throughout. No cadence slowdown found through
5000×256px. Physical GPU presentation and school hardware remain unmeasured.
Shared assets preloaded, transparent sprites overlap/clip; source and drawn area
increase together, so this is not an isolated decoding/compression benchmark.

Independent retained Sol/high complete10-file review is clean. Export/canonical
hashes, raw statistics and unchanged prior sites independently verified; oneinitial
turn/wave, zero fixes/targetedwaves. Effective model/tokens unavailable. Review
receipt .verification/actor-stress-sizes-review/initial.json. Only completion docs
follow the reviewed source.

Evidence in docs/EVIDENCE.md and ignored .verification/actor-stress-web-sizes/
{build,receipt,samples}.json; native/check logs .verification/actor-stress-sizes-*.
IAB4 after timing shows5000/256px with60FPS/16.6msavg/19msworst, marked deliverable;
screenshot actor-stress-web-sizes/live-5000-256.png. Parent server95462 remains at
http://127.0.0.1:49907/9c7976b2e96d36cde02ff7f8c4b68ca78fa8/.
Oldservers34613/93232 idle; workerbrowser/serverclosed. Prior runtime/semantic
verification reused without claiming new full-suite runs. Use source Zero Dev loop
for future changes; broader architecture and preservation policies unchanged.
