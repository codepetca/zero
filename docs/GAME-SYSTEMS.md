# Game systems in Zero

The current structure suits small 2D games and student-written systems. Keep
SketchApp as the window/input/frame host. Main owns the game rules and calls
ordinary Java objects explicitly. No component registry or engine rewrite is
needed for a camera or scoreboard.

| Need | Available now | Next teaching step |
| --- | --- | --- |
| Sprites | Image loading/drawing; Lesson 12 assets | Animation frames in an ordinary Sprite class |
| Sound effects | JavaFX AudioClip; Lesson 12 | Play on a state transition, not every held-key frame |
| Scoreboard | ScoreDisplay; ordinary JavaFX labels/layout | Reuse the same display in a game HUD |
| Camera | GraphicsContext transforms | A Camera holding the world viewport position |
| Physics | Elapsed-time updates; ordinary objects | Gravity, velocity and collision response; overlaps alone are insufficient |
| Levels | Arrays/collections, app-owned state | Separate level data from rules |

## Compose a camera and HUD

Keep world coordinates in Player/Coin, screen coordinates in the HUD. A small
Camera can follow the player's centre and clamp its top-left to world bounds:
`x = max(0, min(playerCentreX - viewportWidth / 2, worldWidth - viewportWidth))`.
Do the same for y. A world smaller than the viewport stays at zero.

In update, Main calls Player.update with world bounds, then Camera.follow. The
current Player needs centre-coordinate getters for that example. In draw:

```java
background(Color.ALICEBLUE);
var g = graphics();
g.save();
try {
    g.translate(-camera.x(), -camera.y());
    for (Coin coin : coins) coin.draw(this);
    player.draw(this);
} finally {
    g.restore();
}
// Draw a canvas HUD here, after restoring screen coordinates.
```

This is a design sketch; Camera and the centre getters are not yet shipped.
A native ScoreDisplay can go in `layout().setBottom(score.view())`, or alongside
buttons in an HBox; it stays outside canvas transforms. Main changes points and
calls setScore. For a translation-only camera, mouse world coordinates are
`mouseX() + camera.x()` and `mouseY() + camera.y()`.

`background()` temporarily uses an identity transform, then restores the old
one. It does not repair an unbalanced camera transform. Always pair save/restore.

## Boundaries for the larger game

SketchApp uses variable frame time capped at 0.1 seconds. Current inclusive
rectangle overlap handles coin collection, not solid collision response or fast
objects crossing a platform between frames. Teach gravity, grounded state and
collision response before building the platformer; use fixed simulation steps
or swept checks if the game needs them. Do not promise a general physics engine.

Canvas/window focus loss clears held input but does not pause simulation. Pause
is app-owned state. Keep the canvas in the centre; inherited show can replace it
without stopping its timer. Use update/draw state for screens initially.

Load small assets once. AudioClip keeps uncompressed samples in memory; use it
for brief effects. The current final SketchApp shutdown hook stops the timer and
clears input but offers no app cleanup callback. Looping music and owned resources
need an explicit idempotent cleanup design when that shared need is demonstrated.
No extra lifecycle hook is needed for the current 0.12-second one-shot demo.

Next implementation after media: a scrolling-world example with ordinary Camera,
Player and ScoreDisplay objects. Then solid platforms/physics, enemies/levels and
win/lose/restart. These are planned stages, not delivered features.
