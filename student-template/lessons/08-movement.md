# 8. Move a player

**First checkpoint: move the square.**

![Cornflower-blue player at 40,180 on an AliceBlue canvas, with the arrow-key instruction](visuals/08.svg)

Target illustration: the starting player, before moving.

1. Follow the [safe switching steps](README.md#before-each-lesson); copy Player and Main from [stage 1](#1-draw-a-square).
2. Add the complete `update(...)` method from [stage 2](#2-read-keys-and-update); **Save → Stop → Run App**.
3. Click the canvas, hold **Right**, then release it.

**Done:** Hold Right: the square moves. Release: it stops. More checks follow.

Build a canvas app with an ordinary Player object.
Previous: [Study app](07-study-app.md).

## 1. Draw a square

Stop the app and save your previous source outside `src/`. Keep `src/main/java/zero/`.
Copy [movement Player.java](../examples/movement/Player.java) into `src/main/java/`.
Replace `src/main/java/Main.java` with:

```java
import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import zero.SketchApp;

public class Main extends SketchApp {
    private Player player;

    @Override public void settings() {
        title("Move a square");
        size(640, 400);
    }

    @Override public void setup() {
        player = new Player(40, 180);
    }

    @Override public void draw() {
        background(Color.ALICEBLUE);
        fill(Color.DARKSLATEGRAY);
        textSize(20);
        text("Click the canvas, then hold the arrow keys.", 20, 30);
        player.draw(this);
    }

    public static void main(String[] args) { launch(args); }
}
```

Run App. The square appears at x = 40, y = 180 and stays still.
`SketchApp` calls `draw()` each frame. Main calls `player.draw(this)` explicitly;
creating a Player does not make it move. `background(...)` clears the last frame.

## 2. Read keys and update

Insert this complete method inside Main, before `draw()`:

```java
@Override public void update(double seconds) {
    int horizontal = 0;
    int vertical = 0;
    if (keyDown(KeyCode.LEFT)) horizontal--;
    if (keyDown(KeyCode.RIGHT)) horizontal++;
    if (keyDown(KeyCode.UP)) vertical--;
    if (keyDown(KeyCode.DOWN)) vertical++;
    player.update(horizontal, vertical, seconds, width(), height());
}
```

Save, Stop and Run App. Click the canvas, then try each arrow. Up decreases y;
Down increases y. Separate `if` statements let diagonal keys work together and
opposite keys cancel. Release the keys: movement stops.

Each frame calls `update(seconds)`, then `draw()`. In Player:

```java
x += horizontal * speed * seconds;
y += vertical * speed * seconds;
```

At speed 180, holding Right for a 0.05-second update moves 9 pixels.
Frame durations vary. Diagonals move 180 pixels per second on each axis, so their
overall speed is faster. Main reads input; Player owns position and movement.

The complete result is [movement Main.java](../examples/movement/Main.java) plus
[Player.java](../examples/movement/Player.java), both copied into `src/main/java/`.
No Maven or framework changes are needed.

## 3. Change and check

In Player, change `speed` from 180 to 90. Run and compare. Restore 180.
Then change `size` from 24 to 40. Test all four edges: the whole square stays
inside the canvas. Its top-left x is limited from 0 to `width - size`; y from
0 to `height - size`. Restore 24 before the next lesson.

Try Left + Right, Right + Up, releasing all keys and switching to another window.
Focus loss clears held keys; click the canvas to resume. Explain what happens if
Main stops calling `player.update(...)` but continues calling `player.draw(this)`.

Next: [Build a coin game](09-coin-game.md).
