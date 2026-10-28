# 9. Build a coin game

**First checkpoint: collect one coin exactly once.**

![A blue player approaching one gold coin, with score text on the canvas](visuals/09.svg)

Reopen the **same Coin game project** from lesson 8. Keep the Player and Main you wrote.

Previous: [Move a player](08-movement.md).

## 1. Give Player a contact method

In `Player.java`, **find:**

`public void draw(GameApp app) {`

**Add above** that method:

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

In `Main.java`, **find:**

`private Player player;`

**Add below:**

```java
private Coin coin;
private int points;
```

In `setup()`, **find:**

`player = new Player(40, 180);`

**Add below:**

```java
coin = new Coin(220, 180);
```

In `update()`, **find:**

`player.update(horizontal, vertical, seconds, width(), height());`

**Add below:**

```java
if (!coin.isCollected() && coin.touches(player)) {
    coin.collect();
    points++;
}
```

## 4. Draw the score and coin before the player

In `draw()`, **find:**

`player.draw(this);`

**Add above:**

```java
fill(Color.rgb(47, 79, 79));
text("Score: " + points, 20, 60);
coin.draw(this);
```

## 5. Run App and collect the coin once

Click **Run App**. Touch the coin, stay there, leave, and return. The coin should disappear and the score should become 1 only once. The `!coin.isCollected()` check prevents a point every frame. If you remove it, contact can repeatedly score even though Coin no longer draws. Put it back before continuing.

## 6. Add a score and Restart below the canvas

Zero controls can sit below the canvas. In `Main.java`, **find:**

`import zero.GameApp;`

**Add below:**

```java
import zero.ui.Button;
import zero.ui.Label;
import zero.ui.Row;
```

**Find:**

`private int points;`

**Add below:**

```java
private Label scoreLabel;
private Label message;
```

In `setup()`, **find** the two assignments:

`player = new Player(40, 180);` `coin = new Coin(220, 180);`

**Replace them with** these controls, created once, and a call to the new `restart()` method:

```java
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

In `update()`, **find:**

`points++;`

**Add below:**

```java
scoreLabel.setText("Score: " + points);
```

In `draw()`, **find and remove** the old canvas score line:

`text("Score: " + points, 20, 60);`

Restart should restore the coin, Player's position and score without creating another control row. `showGame()` returns keyboard focus to the retained canvas and clears held input; it keeps the existing control row. It also works here when the game is already showing.

## 9. Grow to three coins and a win

In Main, **find:**

`private Coin coin;`

**Replace with:**

```java
private Coin[] coins;
private boolean won;
```

In `restart()`, **find:**

`coin = new Coin(220, 180);`

**Replace with:**

```java
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

In the same method, **find:**

`if (!coin.isCollected() && coin.touches(player)) {` `coin.collect();` `points++;` `scoreLabel.setText("Score: " + points);` `}`

**Replace with:**

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

## 11. Draw all coins, then test Restart and winning

In `draw()`, **find:**

`coin.draw(this);`

**Replace with:**

```java
for (Coin each : coins) each.draw(this);
```

Main still explicitly updates Player and draws every object. Click **Run App**. Try Restart before collecting, after one coin and after winning. Each run should return to 0 with all three coins visible; winning stops movement until Restart. Change a coin's coordinates to make your own level. Keep each 24-pixel square within x 0–616 and y 0–376.

After writing it, compare with checkpoint 9's [Main.java](../../teaching/checkpoints/9/Main.java), [Player.java](../../teaching/checkpoints/9/Player.java) and [Coin.java](../../teaching/checkpoints/9/Coin.java). Keep this project if you later try the optional [component lessons](10-components.md).

## 12. Save and publish your game

Choose **Commit & push** in Zero, review the changed files, and use a message
such as `Finish coin game`. Check that your latest code is in your GitHub
repository. When your teacher has approved what you are sharing, stop the running app, then choose
**Publish & open app** from the Run dropdown and wait for it to open. Play the
game in your browser and try Restart. The published page and its contents are
public, so include only material you have permission to share. If publication
is unavailable for your repository or school account, ask your teacher for an
alternative rather than changing visibility without approval.

Next: [Make a pet game](13-pet.md).
