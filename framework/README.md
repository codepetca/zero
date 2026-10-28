# Local Zero core library

This development module packages the canonical App, GameApp, ImageRegion, SpriteAnimation, Actor, Collisions, Sound, Music, Color and zero.ui source
for the Component Workshop. The student starter still ships editable core source;
this module does not migrate existing projects or change their API.

From the Zero repository root:

```sh
npm run prepare:starter
./student-template/mvnw -f framework/pom.xml clean package
npm run verify:framework
```

Edit the canonical files in `src/main/java/zero/`. Preparation creates ignored,
readable copies in the starter and refuses to overwrite edited copies. Save
starter edits elsewhere or move the intended change into the canonical source
before preparing again. Root check, test and packaging entry points also prepare
the starter. An extracted starter builds independently with its Maven wrapper;
students need no Node.js or access to this module.

The finite contributor harness lives separately in `checks/zero/SmokeLauncher.java`.
`verify:framework` runs it in a disposable assembled starter with a native GUI;
normal student projects contain the core classes and their own app code.

The Zero UI layer adds Element, Label, Button, Column and Color. Ordinary
student code uses Zero imports; custom components can expose an Element through
composition or extend Element using its advanced JavaFX bridge. `App.show` accepts
an Element, while `GameApp.controls` mounts a live HUD below its canvas. The
[counter and coin prototypes](prototypes/README.md) share one unchanged
ScoreDisplay class and can be assembled/run without installing or releasing Zero.
GameApp now provides showGame, pause, resume and isPaused. Inherited show
navigates to another view and suspends gameplay update/draw/input; showGame returns
to the retained canvas/HUD. Explicit pause skips update while visible gameplay
still draws; returning preserves that pause. Frame navigation commits after a
successful draw and idle UI navigation commits immediately. Main owns game rules,
resets and ordinary title/help/pause/results component classes. A framework Screen
lifetime class and World remain proposed; there is one game frame driver. See
[game-flow semantics](../student-template/API.md#game-flow).

The small game helpers are local, unreleased additions; published Mac setup
0.5.15 still ships core 0.1.2. See the [complete API](../student-template/API.md)
and [student guide](../student-template/APP-GUIDE.md#sprite-frames-and-small-game-helpers).
Sprite clocks are explicitly updated by their owner; region/animation objects
share their backing Image. Successful image loads use an app-scoped cache
cleared at shutdown. Grid assets require aligned equal-size cells dividing the
image exactly; explicit region sequences support irregular atlases. Frame-edge
input is non-consuming during one real update/draw, and focus loss clears it.

Actor is an unreleased local source addition. It is an extensible ordinary Java
object with a centre position, drawing size, clockwise facing and an Image,
ImageRegion or AnimationSource (including SpriteAnimation). Main explicitly updates and draws each actor;
there is no registration, automatic movement or collision geometry. Subclass
behaviour belongs in protected onUpdate(seconds). The final update(seconds)
validates time, runs that hook and advances the actor's playback once. Sharing a
SpriteAnimation source gives each actor a fresh independent clock; drawing only
reads the cached frame. See the
[Actor API](../student-template/API.md#actor) and
[complete chase example](../student-template/APP-GUIDE.md#moving-objects-with-actor).
Existing installed kits and published website bytes are unchanged.

App and GameApp both provide loadSound/loadMusic. Sound caches each
successful canonical resource as one live wrapper, sharing volume/mute settings;
manually closing it allows a fresh load. Music creates an independent buffered
MediaPlayer per call. Short effects retain decoded samples in memory. Audio
controls, loaders and close run on the FX thread. Owned audio closes on stop/window close,
startup failure and frame failure, even if an extension shutdown hook throws.
Game pause/focus/restart policy remains explicit in Main. See the
[audio API](../student-template/API.md#audio) for thread, close and failure behavior.

The JAR and sources JAR are generated in target/. No remote publishing target is
configured. Current Zero source uses the [Zero Source-Available License](../LICENSE); prior MIT rights remain intact; public Maven coordinates remain unresolved.
Never add this JAR to a project that already compiles its own zero.App and
zero.GameApp; pick one source of the framework classes.
