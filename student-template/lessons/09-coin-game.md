# 9. Build a coin game

**First checkpoint: add one coin.**

![Blue player at 40,180 and a gold square at 220,180 on an AliceBlue canvas](visuals/09.svg)

Target illustration: one gold square; collection comes next.

1. [Start a fresh Lesson 9 project](README.md#start-a-lesson) with Lesson 8's movement Main and Player already in place.
2. Follow [stage 1](#1-add-one-coin): use the included Player and Coin, then add the coin field, setup and draw call.
3. **Run App**; click the canvas and move onto the gold square.

**Done:** The gold square stays visible when touched. Score and Restart come later.

Grow your moving square into a complete game: collect coins, score, win, restart.
Previous: [Movement](08-movement.md).

## 1. Add one coin

The fresh Lesson 9 project includes Lesson 8's complete movement Main and
[coin-game Player.java](../examples/coin-game/Player.java), which adds `touches(...)`.
It also includes [Coin.java](../examples/coin-game/Coin.java).

Add `private Coin coin;` beside Main's Player field. Replace `setup()` with:

```java
@Override public void setup() {
    player = new Player(40, 180);
    coin = new Coin(220, 180);
}
```

In `draw()`, insert `coin.draw(this);` immediately before `player.draw(this);`.
Run App. Move onto the gold square: it stays visible because there is no
collection rule yet. `Player.touches(...)` compares both squares' x and y ranges;
even touching an edge counts.

## 2. Collect and score once

Add `private int points;` beside Main's other fields. At the end of `update()`,
immediately after `player.update(...)`, add:

```java
if (!coin.isCollected() && coin.touches(player)) {
    coin.collect();
    points++;
}
```

In `draw()`, immediately before `coin.draw(this);`, add:

```java
text("Score: " + points, 20, 60);
```

Run again. Touch the coin: it disappears and the score becomes 1. Stay there,
leave and return: the score stays 1. Main owns `points`; Coin owns `collected`.
The `!coin.isCollected()` check prevents a point on every frame, and Coin's
`draw()` skips collected coins.

## 3. Add native controls and Restart

For the next stage, use the complete [controls Main.java](../examples/coin-game-controls/Main.java)
in this same lesson project. Player and Coin stay the same. The three app files are:

| From | To |
| --- | --- |
| [coin-game-controls Main.java](../examples/coin-game-controls/Main.java) | `src/main/java/Main.java` |
| [coin-game Player.java](../examples/coin-game/Player.java) | `src/main/java/Player.java` |
| [Coin.java](../examples/coin-game/Coin.java) | `src/main/java/Coin.java` |

Run this complete stage. There is still one coin. The score and message now
appear in ordinary JavaFX Labels beneath the canvas, beside a Restart button.
Collect the coin: score becomes 1, the coin disappears, and movement continues.
Stay there, leave and return: the score stays 1.

Read `setup()`: it creates the controls once, connects Restart's handler and
places their HBox with `layout().setBottom(controls)`. SketchApp already hosts
JavaFX controls around its canvas. Main explicitly changes the score Label
when `points` changes; drawing the canvas does not update that Label for you.

Choose Restart before collecting, then after collecting. Expect player (40, 180),
the restored coin, score 0 and the original message. Collect again.
`restart()` creates fresh Player and Coin objects and reuses the existing Labels.
It calls `canvas().requestFocus()` so arrows return to the game after clicking
the button. If keys are inactive after switching windows, click the canvas.
Restart does not call `setup()` or build a second interface.

## 4. Add more coins and win

For the final game stage, update Main in this lesson project with the complete
[coin-game Main.java](../examples/coin-game/Main.java). Keep its
[Player.java](../examples/coin-game/Player.java) and
[Coin.java](../examples/coin-game/Coin.java). These are the exact three Java files
alongside `zero/`; no ScoreDisplay, resources or Maven changes are needed.

Run App. There are three coins. Read `restart()`: named Coin variables become
the `Coin[]` array. In `update()`, the loop checks each object explicitly.
When `points == coins.length`, `won` becomes true and movement stops.
`draw()` still draws the scene. The bottom controls are the same kind as stage 3.

Collect one coin and choose Restart. Expect all three coins, the original player
position, score 0 and the original message. Finish, then Restart and finish again.
Restart creates fresh Player and Coin objects and resets both `points` and `won`.

## 5. Make your own level

In `restart()`, add a fourth named variable before the array assignment:

```java
var fourthCoin = new Coin(80, 320);
```

Replace the array assignment with:

```java
coins = new Coin[] { firstCoin, secondCoin, thirdCoin, fourthCoin };
```

Run and collect all four. The counter and win rule follow `coins.length`.
Change coin positions to design your level. Each coin is 24 × 24: keep x from
0 to 616 and y from 0 to 376, and leave room to reach it.

Check all edges, a missed coin, repeated contact, partial-game Restart and
post-win Restart. Explain which object owns position, collection state and score.

Next: [Reuse a component](10-components.md).
