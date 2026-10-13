# 12. Grow your Coin game

**First checkpoint: your moving player becomes a sprite and a collected coin rings.**

![The lesson 9 Coin game with a robot player, three coins and a native score below the canvas](visuals/12.svg)

1. Reopen the **same Coin game** you wrote in lessons 8–11. Keep your Player, Coin, ScoreDisplay and Main.
2. Optionally download the small [game assets ZIP](https://zero.codepet.ca/generated/learning-assets/game-assets.zip) and place `media-demo/player.png` and `media-demo/chime.wav` under `src/main/resources/`. You may use your own PNG and short WAV at those paths, or use the drawing route below without assets.
3. Add the media fields and methods below, **Run App**, collect a coin, then Restart.

**Done:** With assets, the player is an image and each coin sounds once; without assets, the blue square remains playable. Score and Restart still work. This lesson changes your current project in place. It supplies no later stage project ZIPs.

Previous: [Check a component](11-zerohub.md).

## 1. Draw an image from Player

In your existing `Player.java`, add `import javafx.scene.image.Image;`. Keep its current `draw(...)` method for the no-assets route. Add a second method inside Player:

```java
public void drawImage(SketchApp app, Image sprite) {
    app.image(sprite, x, y, size, size);
}
```

This uses the same `x`, `y` and `size` as the blue square. Movement, touching coins and Restart still use one Player object. You can keep drawing your own shapes instead of using a PNG.

## 2. Load optional local resources once

In Main, add imports for `javafx.scene.image.Image`, `javafx.scene.media.AudioClip` and `javafx.scene.media.MediaException`. Add these fields:

```java
private Image sprite;
private AudioClip chime;
private Label soundStatus;
private int plays;
```

At the **start** of your existing `setup()`, before making the controls, add:

```java
var imageFile = getClass().getResource("/media-demo/player.png");
if (imageFile != null) sprite = loadImage("/media-demo/player.png");
var soundFile = getClass().getResource("/media-demo/chime.wav");
if (soundFile != null) {
    try {
        chime = new AudioClip(soundFile.toExternalForm());
        chime.setVolume(0.25);
    } catch (MediaException failure) {
        throw new IllegalArgumentException(
                "Cannot load sound: /media-demo/chime.wav", failure);
    }
}
```

The `/` starts at `src/main/resources/`. Missing optional files leave `sprite` and `chime` null so the drawn game still runs. An invalid image or sound reports its resource path. If you use your own files with different names, change these two paths to match. Run after adding the files; no asset download is needed to compile.

## 3. Play one chime per collection

In `setup()`, after creating your score and message controls, add `soundStatus = new Label();`. In the **existing** `new HBox(...)`, add `soundStatus` between `score.view()` and `message`; keep the Restart button. In `restart()`, after resetting points, add:

```java
plays = 0;
soundStatus.setText("Chimes: 0");
```

Inside the coin collection block in `update()`, just after `score.setScore(points);`, add:

```java
if (chime != null) {
    chime.stop();
    chime.play();
    plays++;
    soundStatus.setText("Chimes: " + plays);
}
```

At the end of `draw()`, replace `player.draw(this);` with:

```java
if (sprite == null) player.draw(this);
else player.drawImage(this, sprite);
```

Run App. Move over one coin and wait there: score and chime count rise once. Collect two more, then Restart. The count returns to 0 and all coins return. The counter shows that an audio action was requested; your ears, device volume and media support check actual sound. After you do the edits, compare with the media checkpoint's [Main.java](../../teaching/checkpoints/12/media/Main.java) and [Player.java](../../teaching/checkpoints/12/media/Player.java).

## Optional stage 2: scroll a wider world

Keep editing this folder. Add a new `Camera.java` class with a private `double x`, `double x()` getter, and this method:

```java
public void follow(double playerX, double viewportWidth, double worldWidth) {
    x = Math.max(0, Math.min(playerX - viewportWidth / 2,
            worldWidth - viewportWidth));
}
```

Add `public double x() { return x; }` to Player. In Main add `private final double worldWidth = 1600;` and `private Camera camera;`. Create `camera = new Camera();` in `restart()` and move two coins farther away, for example x 840 and 1360. Pass `worldWidth` instead of `width()` to `player.update(...)`, then call `camera.follow(player.x(), width(), worldWidth);` after movement. To draw world objects, add overloads `Player.draw(SketchApp app, double cameraX)`, `Player.drawImage(SketchApp app, Image sprite, double cameraX)` and `Coin.draw(SketchApp app, double cameraX)`. In each, use `x - cameraX` for the image or rectangle's horizontal drawing coordinate; keep the original methods and collection positions unchanged. In Main's `draw()`, pass `camera.x()` to those new methods. Native ScoreDisplay and Restart stay outside the canvas and do not scroll. Check both world edges and collect a far coin. Compare your edits with the optional [scrolling checkpoint Main](../../teaching/checkpoints/12/scrolling/Main.java) and [Camera.java](../../teaching/checkpoints/12/scrolling/Camera.java), or the maintained [scrolling example](../examples/scrolling-game/README.md), then return to **your own code**.

## Optional stage 3: platforms and gravity

Continue the same game. Add a `Platform.java` with `x`, `y`, `width`, `height`, getters and `draw(SketchApp app, double cameraX)` that calls `app.rect(x - cameraX, y, width, height)`. Main owns `private Platform[] platforms;` and creates ground and ledges in `restart()`, for example `new Platform(0, 300, 600, 20)` and `new Platform(700, 240, 180, 20)`. Draw each platform before the coins and player.

Move the coins near reachable ledges. In Player, add `private double velocityY; private boolean grounded = true;`. Keep the old `update(...)` for your top-down version. Add a new `updatePlatform(int horizontal, boolean jumpPressed, double seconds, double worldWidth, Platform[] platforms)` method. It moves x with the existing `speed`, clamps x to `worldWidth - size`, starts a jump only when `jumpPressed && grounded` (`velocityY = -460`), then on each frame applies `velocityY = Math.min(800, velocityY + 1200 * seconds); y += velocityY * seconds;`. Save the old bottom (`oldY + size`) before moving. When falling (`velocityY >= 0`), land only if the old bottom was at or above a platform top, the new bottom reaches it, and the player's horizontal range overlaps the platform. Landing sets `y = platform.y() - size`, `velocityY = 0`, `grounded = true`. Otherwise set `grounded = false`. In Main, replace only the movement call with `player.updatePlatform(horizontal, jumpPressed, seconds, worldWidth, platforms);`; compute a fresh Space press with a `private boolean jumpHeld` field so holding Space through landing does not jump again. After falling below the canvas, call `restart()` or show a loss. Test a landing, a gap, and a held jump. See the maintained [platform example](../examples/platform-game/README.md) for side and underside collision details if you extend this simple landing rule.

## Optional stage 4: levels and enemies

Add a `Level.java` that stores a `Platform[]`, `Coin[]`, spawn x/y and an exit x; its constructor creates the data for either level number 0 or 1. Main adds `private Level level; private int levelIndex;` and a `startLevel(int index)` method. That method sets `levelIndex = index`, constructs `level = new Level(index)` so coins are fresh, creates Player at `level.spawnX()`/`level.spawnY()`, assigns Main's `platforms` and `coins` from the new level, resets camera and displays the level number. `restart()` sets points and levelIndex to 0, then calls `startLevel(0)`. When every coin in the current level is collected and `player.x() >= level.exitX()`, call `startLevel(1)` from level 0; after level 1, enter the won state instead. Keep total score in Main and call `score.setScore(points)` when it changes. An optional `Enemy.java` can store x/y, move with an explicit `update(seconds)`, and expose `touches(Player)` using Player's existing contact method. Main owns an `Enemy[]`, explicitly updates/draws it, and decides whether a touch loses the current run. Check that entering a second level creates fresh coins and that the native score stays fixed while scenery moves. The maintained [level example](../examples/level-game/README.md) shows a complete reference with two levels.

## Optional stage 5: endings and Restart

Use `private boolean won; private boolean lost;` in Main. At the top of `update()`, use `if (won || lost) return;`; keep `draw()` running so the last scene and message remain visible. Finishing the last level sets won and a clear win message. Enemy contact or a fall sets lost and a clear loss message. In `restart()`, clear both flags, score and level index, then call `startLevel(0)` without creating controls again. Check win → frozen movement → Restart → first coin, and loss → frozen movement → Restart → first coin. The maintained [full-game source](../examples/full-game/README.md) is an advanced reference; inspect one method at a time and keep your own project and authored classes.

These optional stages are larger exercises. Save a copy of your **own** project folder before an experiment if you want an easy way back; keep it local. Your study quiz and Coin game remain the two continuing practice projects, and an original shareable game is an optional separate fourth project. Return to the [lesson index](README.md).
