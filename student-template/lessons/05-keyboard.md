# 5. Control movement

Your goal is to connect held keys to direction values, elapsed time and bounds.

## Open and predict

Back up your current app. Copy [keyboard Main](../examples/keyboard/Main.java)
and [Mover](../examples/keyboard/Mover.java) into `src/main/java/` using
[the switching steps](README.md#before-each-lesson). Run and click the canvas.

Before trying them, predict Main's direction values:

| Held keys | horizontal | vertical |
| --- | --- | --- |
| None | 0 | 0 |
| Left | -1 | 0 |
| Right and Up | 1 | -1 |
| Left and Right | 0 | 0 |

Explain how separate `if` statements allow more than one held key to contribute.
Run each case. Positive y moves down, so Up subtracts from vertical.

## Trace the distance and bounds

Main passes direction, elapsed seconds, width and height to Mover explicitly.
Mover stores its own coordinates and uses:

```java
x += horizontal * speed * seconds;
```

With speed 180 and seconds 0.05, Right moves 9 pixels on that update before the
bounds check. Frame durations vary; do not assume that every frame takes 0.05.
Moving diagonally updates both axes, so the original example moves faster overall
on a diagonal than along one axis.

The circle's radius is 18. Its centre is limited from radius to width minus radius,
and likewise for height. Limiting the centre to 0 would leave half the circle
outside the canvas. Read `Math.min` as choosing the smaller value and `Math.max`
as choosing the larger value.

## Change one rule at a time

1. Change `speed` from 180 to 90. Compare the movement without changing the time
   calculation.
2. Change `radius` from 18 to 28. Predict the allowed centre positions on the
   640 × 400 canvas: x from 28 to 612, y from 28 to 372. Test all four edges.
3. In Main, change the right-key condition to accept either Right or D:

```java
if (keyDown(KeyCode.RIGHT) || keyDown(KeyCode.D)) horizontal++;
```

Replace the original right-key statement with this one; do not add a second
increment. Check D alone, Right alone and both together: all should produce the
same rightward speed. Keep the other arrow controls.

## Check and explain

Hold each direction against its edge: the whole circle should stay visible. Try
opposite keys, diagonals, releasing all keys and changing window focus. Movement
should stop on release or loss of focus; click the canvas before resuming.

Show one change and explain Main's input responsibility versus Mover's movement
responsibility. Record an edge check and the D/Right/both comparison. Predict what
would happen if Main stopped calling `mover.update(...)` but kept drawing it.
