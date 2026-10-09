# 4. Animate an ordinary object

Your goal is to explain how Main explicitly updates and draws a Player object.

## Open and predict

Back up your current app. Copy [animation Main](../examples/animation/Main.java)
and [Player](../examples/animation/Player.java) into `src/main/java/` using
[the switching steps](README.md#before-each-lesson).

Run, move the mouse inside the canvas, then click the canvas and hold Space.
Predict the target in each case: the mouse normally, the centre while Space is
held. Release Space and compare. Canvas keys require canvas focus.

## Trace one frame

`SketchApp` calls Main's `update(seconds)` and then `draw()` each frame. Main
creates Player once in `setup()`. Player is an ordinary object; it moves because
Main calls `player.update(...)`, and appears because Main calls `player.draw(this)`.

Canvas x increases to the right; y increases downward. Player's x/y describe the
circle's centre. In `circle(x, y, 44)`, 44 is the diameter. The canvas size is
fixed: making the window larger does not stretch its coordinates.

Read the following expression in Player:

```java
x += (targetX - x) * amount;
```

If x is 100, targetX is 200 and amount is 0.1, the new x is 110. It moves part of
the remaining distance, rather than jumping immediately. `seconds` is the elapsed
time since the previous frame, not a frame number. The framework caps it at 0.1
after a long pause.

## Compare two movement rules

1. Back up Player. Replace the two smoothing statements with `x = targetX;` and
   `y = targetY;`. Run and compare following versus jumping.
2. Restore the original statements. Change the factor in `seconds * 5` to 2,
   then 8, rebuilding each time. Which catches up more quickly? This factor
   controls following responsiveness, rather than a fixed pixels-per-second speed.
3. Change the circle colour and diameter. Keep Main's explicit calls in place.

Optional experiment: temporarily remove `background(...)` from Main's `draw()`.
Predict what happens to old circle drawings, then run. Restore it afterward;
Zero does not automatically clear each frame.

## Check and explain

Record mouse-following, Space-to-centre, release-to-follow and Stop/Run results.
After clicking a different window, click the canvas again before checking keys.
Explain why calling update only in setup would not animate Player, and why changing
Player does not require a special game-object base class. Include the arithmetic
prediction above and one observed difference between your movement rules.
