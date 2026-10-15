# Game systems in Zero

Lesson 12 builds a two-level platformer in five runnable stages. SketchApp stays
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

SketchApp caps variable frame time at0.1seconds. The platformer Player further
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

Load assets once; play a short effect on collection. AudioClip keeps samples in
memory, so brief effects remain appropriate. The core shutdown stops animation
and clears input but has no application cleanup callback. Looping music still
needs an explicit idempotent cleanup design when a shared need is demonstrated.

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

## Local core helpers

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
