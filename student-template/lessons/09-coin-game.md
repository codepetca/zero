# 9. Build a coin game

Grow your moving square into a complete game: collect coins, score, win, restart.
Previous: [Movement](08-movement.md).

## 1. Add one coin

Start with Lesson 8's complete Main. Stop the app and save a copy outside `src/`.
Copy [coin-game Player.java](../examples/coin-game/Player.java) over your Player;
it adds `touches(...)` to the movement code. Copy
[Coin.java](../examples/coin-game/Coin.java) into `src/main/java/`.
Keep the framework folder and your movement Main.

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

## 3. Add more coins, win and restart

Replace Main with the complete [coin-game Main.java](../examples/coin-game/Main.java).
Keep its [Player.java](../examples/coin-game/Player.java) and
[Coin.java](../examples/coin-game/Coin.java). These are the exact three files
copied into `src/main/java/`; no ScoreDisplay, resources or Maven changes are needed.

Run App. There are three coins. Read `restart()`: named Coin variables become
the `Coin[]` array. In `update()`, the loop checks each object explicitly.
When `points == coins.length`, `won` becomes true and movement stops.
`draw()` still draws the scene. The score, message and Restart button use
ordinary JavaFX controls beneath the canvas.

Collect one coin and choose Restart. Expect all three coins, the original player
position, score 0 and the original message. Finish, then Restart and finish again.
Restart creates fresh Player and Coin objects and resets both `points` and `won`.

## 4. Make your own level

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
