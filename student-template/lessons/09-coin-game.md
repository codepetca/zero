# 5. Build a coin game

**First checkpoint: collect one coin exactly once.**

![A blue player approaching one gold coin, with score text on the canvas](visuals/09.svg)

Reopen the **same Coin game project** from lesson 4. Keep the Player and Main you wrote.

Previous: [Move a player](08-movement.md).

## 1. Add a contact method before `draw()`

In `Player.java`, add `touches` before `draw`; replace the matching lines with the copied code:

```java-after-1-2-3-4
    public boolean touches(double otherX, double otherY, double otherSize) {
        return x + size >= otherX && x <= otherX + otherSize
                && y + size >= otherY && y <= otherY + otherSize;
    }
    public void draw(GameApp app) {
```

Both horizontal and vertical ranges must meet. The comparisons count touching an edge.

## 2. Write Coin.java

Create `java/Coin.java` yourself. Coin owns its position and collection state; Main owns the score.

```java
import zero.Color;
import zero.GameApp;

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

    public void draw(GameApp app) {
        if (collected) return;
        app.fill(Color.GOLD);
        app.rect(x, y, size, size);
    }
}
```

## 3. Collect one coin

In `Main.java`, add the coin and points fields; replace the matching lines with the copied code:

```java-after-2-3
    private Player player;
    private Coin coin;
    private int points;
```

In `setup()`, add the coin assignment; replace the matching lines with the copied code:

```java-after-2
        player = new Player(40, 180);
        coin = new Coin(220, 180);
```

In `update()`, add the collection check; replace the matching lines with the copied code:

```java-after-2-3-4-5
        player.update(horizontal, vertical, seconds, width(), height());
        if (!coin.isCollected() && coin.touches(player)) {
            coin.collect();
            points++;
        }
```

## 4. Draw the score and coin before the player

In `draw()`, add the score and coin drawing before the player; replace the matching lines with the copied code:

```java-after-1-2-3
        fill(Color.rgb(47, 79, 79));
        text("Score: " + points, 20, 60);
        coin.draw(this);
        player.draw(this);
```

## 5. Run App and collect the coin once

Click **Run App**. Touch the coin, stay there, leave, and return. The coin should disappear and the score should become 1 only once. The `!coin.isCollected()` check prevents a point every frame. If you remove it, contact can repeatedly score even though Coin no longer draws. Put it back before continuing.

## 6. Add a score and Restart below the canvas

Zero controls can sit below the canvas. In `Main.java`, add the control imports; replace the matching lines with the copied code:

```java-after-2-3-4
import zero.GameApp;
import zero.ui.Button;
import zero.ui.Label;
import zero.ui.Row;
```

In `Main.java`, add the label fields; replace the matching lines with the copied code:

```java-after-2-3
    private int points;
    private Label scoreLabel;
    private Label message;
```

In `setup()`, replace the two assignments with controls created once and a call to `restart()`. Copy the block over the matching lines:

```java-after-3-4-5-6-7-8-r1-2
        player = new Player(40, 180);
        coin = new Coin(220, 180);
        scoreLabel = new Label("");
        message = new Label("");
        var restartButton = new Button("Restart");
        restartButton.onClick(() -> restart());
        controls(new Row(12, scoreLabel, message, restartButton));
        restart();
```

## 7. Move the starting state into `restart()`

The two assignments you replaced now belong in `restart()`. **Find** the end of `setup()`, just before `update()`. **Add below `setup()`**, inside Main:

```java
public void restart() {
    player = new Player(40, 180);
    coin = new Coin(220, 180);
    points = 0;
    scoreLabel.setText("Score: 0");
    message.setText("Collect the gold square.");
    showGame();
}
```

## 8. Update the score label after collection

In `update()`, add the score label update; replace the matching lines with the copied code:

```java-after-2
            points++;
            scoreLabel.setText("Score: " + points);
```

In `draw()`, **find and remove** the old canvas score line:

`text("Score: " + points, 20, 60);`

Restart should restore the coin, Player's position and score without creating another control row. `showGame()` returns keyboard focus to the retained canvas and clears held input; it keeps the existing control row. It also works here when the game is already showing.

## 9. Grow to three coins and a win

In `Main`, copy the block over the matching field:

```java-after-2-3-r1
    private Coin coin;
    private Coin[] coins;
    private boolean won;
```

In `restart()`, copy the block over the matching assignment:

```java-after-2-3-4-5-6-r1
        coin = new Coin(220, 180);
        coins = new Coin[] {
            new Coin(220, 180), new Coin(420, 80), new Coin(540, 300)
        };
        won = false;
        message.setText("Collect all " + coins.length + " coins.");
```

## 10. Stop movement after collecting every coin

In `restart()`, **find and remove** the earlier message line:

`message.setText("Collect the gold square.");`

**Find** the start of `update()`:

`@Override public void update(double seconds) {`

**Add below:**

```java
if (won) return;
```

In `update()`, copy the block over the existing coin collection check:

```java-after-6-7-8-9-10-11-12-13-14-15-16-r1-2-3-4-5
        if (!coin.isCollected() && coin.touches(player)) {
            coin.collect();
            points++;
            scoreLabel.setText("Score: " + points);
        }
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

## 11. Draw all coins, then test Restart and winning

In `draw()`, copy the block over the matching line:

```java-after-2-r1
        coin.draw(this);
        for (Coin each : coins) each.draw(this);
```

Main still explicitly updates Player and draws every object. Click **Run App**. Try Restart before collecting, after one coin and after winning. Each run should return to 0 with all three coins visible; winning stops movement until Restart. Change a coin's coordinates to make your own level. Keep each 24-pixel square within x 0–616 and y 0–376.

After writing it, compare with checkpoint 9's [Main.java](../../teaching/checkpoints/9/Main.java), [Player.java](../../teaching/checkpoints/9/Player.java) and [Coin.java](../../teaching/checkpoints/9/Coin.java). Keep this project if you later try the optional [component lessons](10-components.md).

## 12. Save and publish your game

Choose **Commit & push** in Zero, review the changed files, and use a message
such as `Finish coin game`. Check that your latest code is in your GitHub
repository. After checking that you have permission to share the contents, stop the running app, then choose
**Publish & open app** from the Run dropdown and wait for it to open. Play the
game in your browser and try Restart. The published page and its contents are
public, so include only material you have permission to share. If publication
is unavailable for your repository or school account, follow your school or account policy and keep your repository visibility unchanged.

Next: [Make a pet game](13-pet.md).
