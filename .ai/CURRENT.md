# Actor prototype and game-system references — 2026-10-22

Local Actor source is complete and independently reviewed at6f0ee4e1, based on
origin/main bf2083a3. Player/Enemy extend Actor; Main explicitly updates and draws
instances. API/guide/website metadata, source assembly and browser export agree.
This final receipt changes documentation only. No push, PR, merge, release,
template publication or website deployment was authorized or performed.

Checks pass: source999/3conditional skips; website163/type/build; native Actor
movement/aiming/atomicity/subclass animation/rotated pixels and framework/input/
audio; Zero Dev real-frame game smoke; extracted guide compiles;6WebFX/GWT builds
and58desktop+136mobile browser checks. One stale image-count test assertion fixed;
independent initial+targeted review has no remaining blockers. See docs/EVIDENCE.md
and ignored .verification/actor/progress.json for receipts and limits.

Latest direction: use established game systems before adding World/UI abstractions.
Greenfoot is the primary Java teaching reference; FXGL, libGDX Scene2D and Godot
inform UI/world/camera/input boundaries. Proposals and sources are recorded in
docs/GAME-SYSTEMS.md. World, camera and screen APIs are not implemented. Next design
step is coin collector, scrolling enemy game and simulation/control-panel examples.

Preserve primary funding checkout and tutorial-padding Dev scratch/profile/watcher
and unrelated edits. This attached Actor checkout retains its source and ignored
receipts; its Zero Dev UI watcher is running on3158. Local website preview3159 is
for API verification. Physical other OS/devices/browser engines remain untested.
