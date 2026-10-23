# Game systems in Zero

Lesson 12 builds a two-level platformer in five runnable stages. GameApp stays
small: it hosts the window, input and frames. Main owns the rules and explicitly
updates/draws ordinary Java objects. No registry or engine rewrite is needed.

| Stage | Example | New system |
| --- | --- | --- |
| 1 | [media-demo](../student-template/examples/media-demo/README.md) | Cached Image and one-shot AudioClip |
| 2 | [scrolling-game](../student-template/examples/scrolling-game/README.md) | Camera, world coordinates and fixed native ScoreDisplay |
| 3 | [platform-game](../student-template/examples/platform-game/README.md) | Gravity, grounded jumping and solid platforms |
| 4 | [level-game](../student-template/examples/level-game/README.md) | Enemy patrols and two levels of ordinary arrays |
| 5 | [full-game](../student-template/examples/full-game/README.md) | Playing/won/lost state and complete restart |

Follow [Lesson 12](../student-template/lessons/12-media.md) for exact copy lists.
The game examples reuse unchanged shared ScoreDisplay source and the original
media-demo PNG/WAV; students may replace the resources with their own.

## Camera and scoreboard

Player/Coin/Platform/Enemy store world coordinates. Camera follows the player
centre, clamps to world edges, and stays at zero for a smaller-than-viewport world:

```java
x = Math.max(0, Math.min(centreX - viewportWidth / 2,
        Math.max(0, worldWidth - viewportWidth)));
```

The same rule handles y. Main calls Player.update, then Camera.follow. Drawing
uses graphics().save(), translate(-camera.x(), -camera.y()), and finally restore().
The native ScoreDisplay sits in a bottom HBox outside canvas transforms; Main owns
points and calls setScore. Canvas instructions draw after restore in screen space.
For this translation-only camera, mouse world coordinates are mouseX()+camera.x()
and mouseY()+camera.y().

background() temporarily uses an identity transform, then restores the old one.
It does not repair a leaked camera transform. Always balance save/restore.

## Physics and game rules

GameApp caps variable frame time at0.1seconds. The platformer Player further
splits it into steps no larger than1/120second, limits fall speed, and resolves
horizontal then vertical solid overlap. The bounded movement is smaller than the
provided platforms' thickness. This is a teaching implementation for axis-aligned
static platforms, with ordinary velocity/grounded fields; it is not general
rigid-body physics, moving-platform support or collision handling for arbitrary
high speeds/tiny obstacles. Main detects new jump presses rather than repeating
jumps while a key stays held.

Level data creates fresh arrays of platforms, coins and enemies. Coins score only
on their collection transition. Both levels require all their coins before exit.
The intermediate level-game retries the current level on danger, preserving
completed-level points, then loops after level2. The final full-game freezes on
loss or final victory; Restart creates fresh level objects and resets game state,
score, player, patrols and camera. Reset suppresses a held jump reported by the canvas until release.

## Resource and lifecycle limits

Load assets once in setup; play a short effect on collection. The maintained
Lesson 12 examples use ordinary JavaFX AudioClip. The local source additionally
provides `loadSound`/`loadMusic` in both App and GameApp. Sound holds decoded
samples in memory and can overlap; aliases return the same live wrapper, sharing
volume/mute. Music uses a separate buffered player/position per load. Owned audio
closes on stop/window close, startup failure and frame failure. Raw JavaFX players
still need their owner's cleanup. Main explicitly pauses/resumes music for pause,
rewinds it for restart, and chooses focus-loss policy. See the
[audio guide](../student-template/APP-GUIDE.md#short-sound-effects).

Canvas/window focus loss clears held and frame-edge input but does not pause
physics or enemies. windowFocused() can support an explicit Main pause rule; a
focused native control still counts as a focused window.
Restart observes that canvas state; physical OS key-repeat after button/canvas
refocus remains a pilot check.
The examples keep the canvas in the centre and manage endings through game state;
inherited show can hide a canvas without stopping its timer. Main still owns pause rules. Moving platforms and a larger physics library
remain future extensions.

Physical Windows/Linux, audible output and novice classroom play still require
trials. See [verification](VERIFICATION.md) for actual local acceptance evidence.

## Design references and next boundaries

Owner direction,2026-10-23: student-led framework evolution is a core goal.
The canonical [framework architecture plan](FRAMEWORK-ARCHITECTURE.md) supersedes
the preliminary reference choices below: JavaFX owns the host; Arcade informs
optional active screens; Greenfoot informs Actor vocabulary; Godot informs focused
composition. Students must be able to extend and replace parts through public
Java contracts, share them through ZeroHub and propose proven ideas for core.
The plan defines animation/content/UI seams, lifetime ownership and acceptance
examples. It does not implement Screen/World or change current Actor behavior.

Earlier direction,2026-10-22: use established small game systems to inform the
design before adding World, camera or screen/UI abstractions. Actor is a local
prototype; these further concepts are proposals, not implemented APIs.

- [Greenfoot Actor](https://www.greenfoot.org/files/javadoc/greenfoot/Actor.html)
  and [World](https://www.greenfoot.org/files/javadoc/greenfoot/World.html) are
  the primary teaching reference: Java subclasses, position/appearance, movement,
  turning/aiming and a container for actors. Zero keeps elapsed seconds and
  explicit calls from Main rather than adopting Greenfoot's environment loop.
- [FXGL's game scene](https://github.com/AlmasB/FXGL/wiki/Game-Scene) separates
  the camera-controlled world view from a fixed UI view. Use that distinction for
  scrolling games, stationary health/score displays and side control panels.
- [libGDX Scene2D](https://libgdx.com/wiki/graphics/2d/scene2d/scene2d) provides
  an explicit container update/draw pattern and lets UI handle input before it
  reaches gameplay. Zero should settle input ownership as part of UI composition.
- [Godot's HUD tutorial](https://docs.godotengine.org/en/stable/getting_started/first_2d_game/06.heads_up_display.html)
  illustrates controls in a layer above gameplay for score, start and game-over
  messages. JavaFX already provides Zero's controls and layout primitives.

Before implementation, exercise the proposed boundaries in a coin collector,
a scrolling enemy game, and a simulation with controls. A World would own actor
membership and safe update/draw ordering. A camera would map world coordinates
to the visible canvas. Fixed HUD/control layouts would use screen coordinates;
an enemy health bar would follow world coordinates. Title/play/pause/results need
defined enter/leave/restart rules, with gameplay paused while menus remain usable.
Keep collision responses and scoring in student Java. Do not infer a new screen
base class or adopt an engine dependency from these reference choices.

## Local core helpers

`Actor` is an optional ordinary superclass for `Player`, `Enemy` and other sprites.
It holds centre x/y, display size and clockwise rotation (0 faces right). Load an
Image, ImageRegion or independent SpriteAnimation in setup and pass it to the
constructor. Main explicitly calls update(seconds) and draw(this); an override
calls super.update(seconds) to advance animation. Movement and aiming helpers
leave game rules with the student. Use Collisions explicitly; an unrotated
rectangle's top-left is actor.x()-actor.width()/2, actor.y()-actor.height()/2.
Rotation does not create a rotated collision shape. Actor is a local source
addition and does not change existing installed kits. See the
[Actor guide](../student-template/APP-GUIDE.md#moving-objects-with-actor).

The current source adds small game helpers without changing the lesson stages
or automatically updating objects. These additions are unreleased; published
Mac setup 0.5.15 ships the older core 0.1.2. See the
[student guide](../student-template/APP-GUIDE.md#sprite-frames-and-small-game-helpers)
and [complete API](../student-template/API.md).

ImageRegion shares a bitmap; SpriteAnimation stores an independent clock and
Main calls update(seconds) explicitly. Use aligned regular grids with dimensions
that divide exactly, or equal-size explicit regions from one image for an atlas.
loadImage caches successful canonical resources per app until shutdown; separate
animations can share that image. Draw natural/scaled frames, centre/rotate them,
flip them vertically, or centre text without leaving changed context styles.

keyPressed/mousePressed are non-consuming edges for the whole real update/draw
frame. Short between-frame taps survive until that frame; held input does not
repeat. A game state pause does not retain edges for a later frame. Static
Collisions predicates include touching and validate finite coordinates and
non-negative dimensions/radii. They do not replace movement or collision response.

Try the local [Sprite playground](../student-template/examples/sprite-playground/README.md) in a fresh project,
copying one example at a time. It shares one bird sheet across two independent
clocks, selects four aligned ImageRegion frames from the atlas, and demonstrates
pause, reset, edge input and collision feedback.

Try the optional [Audio playground](../student-template/examples/audio-playground/README.md) in a separate
fresh project. Its native buttons demonstrate effect playback, music loop/pause/
resume/stop and mute using one setup-time load per resource.
