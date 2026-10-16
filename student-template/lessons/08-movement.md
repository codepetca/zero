# 8. Move a player

**First checkpoint: a square you can move.**

![A blue square on the canvas with an arrow showing movement](visuals/08.svg)

1. [Start the Coin game project](README.md#start-a-lesson) once. Its `Main.java` has empty `setup()`, `update(double seconds)` and `draw()` methods, and no Player class.
2. Write `Player.java` and fill in your existing Main methods below.
3. **Run App**, click the canvas, then hold and release an arrow key.

**Done:** The square moves while a key is held and stops when released. Keep this folder for lessons 9–12. There is no new game download for the next lesson.

Previous: [Your study quiz](07-study-app.md).

## 1. Write Player.java

Create `src/main/java/Player.java`. Player owns position; Main decides when to update and draw it. Type this class, then try changing its color or speed:

```java
import javafx.scene.paint.Color;
import zero.GameApp;

public class Player {
    private double x;
    private double y;
    private final double size = 24;
    private final double speed = 180;

    public Player(double startX, double startY) {
        x = startX;
        y = startY;
    }

    public void update(int horizontal, int vertical, double seconds,
                       double canvasWidth, double canvasHeight) {
        x += horizontal * speed * seconds;
        y += vertical * speed * seconds;
        x = Math.max(0, Math.min(x, canvasWidth - size));
        y = Math.max(0, Math.min(y, canvasHeight - size));
    }

    public void draw(GameApp app) {
        app.fill(Color.CORNFLOWERBLUE);
        app.rect(x, y, size, size);
    }
}
```

The `Math.max`/`Math.min` lines keep the whole square on screen. `x` and `y` are its top-left corner. At 180 pixels per second, a 0.05-second update moves 9 pixels.

## 2. Connect Player to your existing Main

Add `import javafx.scene.input.KeyCode;` and `import javafx.scene.paint.Color;` above Main. Add `private Player player;` inside the class. Fill your starter's **existing** methods:

```java
@Override public void setup() {
    player = new Player(40, 180);
}

@Override public void update(double seconds) {
    int horizontal = 0;
    int vertical = 0;
    if (keyDown(KeyCode.LEFT)) horizontal--;
    if (keyDown(KeyCode.RIGHT)) horizontal++;
    if (keyDown(KeyCode.UP)) vertical--;
    if (keyDown(KeyCode.DOWN)) vertical++;
    player.update(horizontal, vertical, seconds, width(), height());
}

@Override public void draw() {
    background(Color.ALICEBLUE);
    fill(Color.DARKSLATEGRAY);
    textSize(20);
    text("Click the canvas, then hold the arrow keys.", 20, 30);
    player.draw(this);
}
```

Keep the starter's `settings()` and `main(...)`. `GameApp` calls update and draw each frame; it does not find Player automatically. Main reads keys and explicitly calls Player. Click the canvas for keyboard focus. Switching windows clears held keys; click the canvas again to resume.

## 3. Explore and check

Try every edge, Right + Up, Left + Right, and releasing all keys. Change `speed` to 90, run again, compare, then restore 180. Change `size` to 40 and check that the whole square remains visible; restore 24 before lesson 9. If you remove only `player.update(...)`, the square still draws but cannot move. Explain why.

After writing your own code, compare with checkpoint 8's [Main.java](../../teaching/checkpoints/8/Main.java) and [Player.java](../../teaching/checkpoints/8/Player.java). Continue editing **this Coin game folder** in [lesson 9](09-coin-game.md).
