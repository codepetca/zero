# 9. Build a coin game

**First checkpoint: collect one coin exactly once.**

![A blue player approaching one gold coin, with score text on the canvas](visuals/09.svg)

1. Reopen the **same Coin game project** from lesson 8. Keep the Player and Main you wrote.
2. Write Coin, add contact checking to Player, and add one coin to Main.
3. **Run App**. Touch the coin, stay there, leave, and return.

**Done:** The coin disappears and score becomes 1 only once. Then add Restart and two more coins in this same project.

Previous: [Move a player](08-movement.md).

## 1. Give Player a contact method

Inside your existing `Player.java`, add this method before `draw(...)`:

```java
public boolean touches(double otherX, double otherY, double otherSize) {
    return x + size >= otherX && x <= otherX + otherSize
            && y + size >= otherY && y <= otherY + otherSize;
}
```

Both horizontal and vertical ranges must meet. The comparisons count touching an edge.

## 2. Write Coin.java

Create `src/main/java/Coin.java` yourself. Coin owns its position and collection state; Main owns the score.

```java
import javafx.scene.paint.Color;
import zero.SketchApp;

public class Coin {
    private final double x;
    private final double y;
    private final double size = 24;
    private boolean collected;

    public Coin(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public boolean isCollected() { return collected; }
    public boolean touches(Player player) { return player.touches(x, y, size); }
    public void collect() { collected = true; }

    public void draw(SketchApp app) {
        if (collected) return;
        app.fill(Color.GOLD);
        app.rect(x, y, size, size);
    }
}
```

## 3. Collect one coin

In your existing Main, add fields `private Coin coin;` and `private int points;`. In `setup()`, after creating Player, add `coin = new Coin(220, 180);`. At the end of `update()`, after `player.update(...)`, add:

```java
if (!coin.isCollected() && coin.touches(player)) {
    coin.collect();
    points++;
}
```

In `draw()`, just before `player.draw(this);`, add:

```java
fill(Color.DARKSLATEGRAY);
text("Score: " + points, 20, 60);
coin.draw(this);
```

Run App. The `!coin.isCollected()` check prevents a point every frame. If you remove it, contact can repeatedly score even though Coin no longer draws. Put it back before continuing.

## 4. Add a native score and Restart

JavaFX controls can sit below the canvas. Add imports for `javafx.geometry.Insets`, `javafx.scene.control.Button`, `javafx.scene.control.Label`, and `javafx.scene.layout.HBox`. Add fields `private Label scoreLabel;` and `private Label message;`. In `setup()`, create controls **once**, then call a new `restart()` method:

```java
scoreLabel = new Label();
message = new Label();
var restartButton = new Button("Restart");
restartButton.setOnAction(event -> restart());
var controls = new HBox(12, scoreLabel, message, restartButton);
controls.setPadding(new Insets(12));
layout().setBottom(controls);
restart();
```

Remove the old `player = ...` and `coin = ...` lines from `setup()`; put them in `restart()`. Add this method to Main:

```java
public void restart() {
    player = new Player(40, 180);
    coin = new Coin(220, 180);
    points = 0;
    scoreLabel.setText("Score: 0");
    message.setText("Collect the gold square.");
    canvas().requestFocus();
}
```

When a coin is collected, immediately after `points++`, add `scoreLabel.setText("Score: " + points);`. Remove the canvas score `text(...)` line from `draw()`. Restart should restore the coin, Player's position and score without creating another control row. It requests canvas focus after the button receives it.

## 5. Grow to three coins and a win

Replace the field `private Coin coin;` with `private Coin[] coins;`, and add `private boolean won;`. In `restart()`, replace the one coin assignment with:

```java
coins = new Coin[] {
    new Coin(220, 180), new Coin(420, 80), new Coin(540, 300)
};
won = false;
message.setText("Collect all " + coins.length + " coins.");
```

Remove the earlier `message.setText("Collect the gold square.");`. At the start of `update()`, add `if (won) return;`. Replace the single-coin contact block with:

```java
for (Coin each : coins) {
    if (!each.isCollected() && each.touches(player)) {
        each.collect();
        points++;
        scoreLabel.setText("Score: " + points);
    }
}
if (points == coins.length) {
    won = true;
    message.setText("You win! Choose Restart.");
}
```

Replace `coin.draw(this);` with `for (Coin each : coins) each.draw(this);`. Main still explicitly updates Player and draws every object. Try Restart before collecting, after one coin and after winning. Each run should return to 0 with all three coins visible; winning stops movement until Restart. Change a coin's coordinates to make your own level. Keep each 24-pixel square within x 0–616 and y 0–376.

After writing it, compare with checkpoint 9's [Main.java](../../teaching/checkpoints/9/Main.java), [Player.java](../../teaching/checkpoints/9/Player.java) and [Coin.java](../../teaching/checkpoints/9/Coin.java). Keep this project open for [lesson 10](10-components.md); there is no new game starter.
