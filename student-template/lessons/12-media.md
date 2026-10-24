# 12. Grow your Coin game

**First checkpoint: your moving player becomes a sprite and a collected coin rings.**

![The lesson 9 Coin game with a robot player, three coins and a native score below the canvas](visuals/12.svg)

Reopen the **same Coin game** you wrote in lessons 8–11. Keep your Player, Coin, ScoreDisplay and Main. This lesson changes your current project in place and supplies no later stage project ZIPs. Optionally download the small [game assets ZIP](https://zero.codepet.ca/generated/learning-assets/game-assets.zip) and place `media-demo/player.png` and `media-demo/chime.wav` under `src/main/resources/`. You may use your own PNG and short WAV at those paths, or use the drawing route below without assets.

Previous: [Check a component](11-zerohub.md).

## 1. Draw an image from Player

Add `import zero.ImageRegion;` to your existing Player. Keep its shape-drawing
method for the drawing route, and add:

```java
public void drawImage(GameApp app, ImageRegion sprite) {
    app.image(sprite, x, y, size, size);
}
```

An ImageRegion describes a rectangle in shared image pixels. This lesson loads
the whole image, then draws it at Player's existing position and size. There is
still one Player, with the same movement and collision rules.

## 2. Add fields to Main

Import `zero.ImageRegion`, `zero.Sound` and `zero.ui.Column`. Keep the existing
Zero Label, Button and Row imports. Add:

```java
private ImageRegion sprite;
private Sound chime;
private Label soundStatus;
private Label assetStatus;
private int plays;
```

## 3. Add an explicit artwork action

Add this method to Main:

```java
public void loadAssets() {
    try {
        ImageRegion nextSprite = loadImageRegion("/media-demo/player.png");
        Sound nextChime = loadSound("/media-demo/chime.wav");
        nextChime.setVolume(0.25);
        sprite = nextSprite;
        chime = nextChime;
        assetStatus.setText("Artwork and sound ready");
    } catch (IllegalArgumentException failure) {
        assetStatus.setText(failure.getMessage());
    }
    showGame();
}
```

The `/` starts at `src/main/resources/`. Load both candidates before changing the
fields. If a requested file is missing or invalid, the error names its path and
the existing game stays playable. The catch handles this expected resource error
and shows it; it does not silently ignore it. Other programming errors still surface.
`showGame()` returns keyboard focus to the retained canvas after the button.

Zero caches the image pixels and owns the Sound's cleanup when the app closes.
A repeated load may create a new immutable ImageRegion over the same cached
pixels. Restart reuses these resources; do not close the borrowed Sound there.
Load in setup or an action, never every frame. Use artwork/audio you created or
have permission to redistribute, and include required licence files in the
project. These are bundled paths, not absolute paths on your computer.

In browsers, packaged images preload before setup. A corrupt packaged PNG can
therefore report a startup error before the button appears. Audio may fail later
during decoding or playback; keep Zero's named audio notices and gesture prompt.
The ready label means the action selected resources, not that sound was heard.

## 4. Add controls once in setup

Replace the existing `controls(new Row(...))` call with:

```java
soundStatus = new Label("");
assetStatus = new Label("Drawing mode");
var artworkButton = new Button("Use artwork and sound");
artworkButton.onClick(() -> loadAssets());
controls(new Column(8,
        new Row(12, score.view(), soundStatus, message, restartButton),
        new Row(12, artworkButton, assetStatus)));
```

Keep the existing score, message, Restart callback and final `restart()` call.
The second row gives the action and its result room below the score. The game
starts in drawing mode, even when resources are bundled.

At the start of `restart()`, add `if (chime != null) chime.stop();`. After resetting
points, reset the request counter:

```java
plays = 0;
soundStatus.setText("Chimes: 0");
```

## 5. Request a chime after collection

Inside the existing coin-collection block, immediately after
`score.setScore(points);`, add:

```java
if (chime != null) {
    chime.stop();
    chime.play();
    plays++;
    soundStatus.setText("Chimes: " + plays);
}
```

Main's collected check still prevents repeated scoring and sound requests while
standing on one coin. The counter records requests; your ears, device volume
and media support determine whether you hear the sound.

## 6. Choose the image or drawing

At the end of Main's existing draw method, replace `player.draw(this);` with:

```java
if (sprite == null) player.draw(this);
else player.drawImage(this, sprite);
```

## 7. Run both routes and test Restart

Run App before importing assets. The blue square can collect all three coins and
Restart. Click **Use artwork and sound**: a missing path should appear, and you
can still play. If you choose a drawing-only game, keep drawing and remove the
artwork button and media fields from your finished version.

For the artwork route, import the two files at the paths above, run again and
click the button. The player becomes the supplied image. Collect one coin and
stay there: score and chime count rise once. Finish and Restart twice. Score and
chime count return to 0; the artwork stays loaded. Repeated artwork clicks reuse
resources and keep the same Player and control objects. If playback is blocked,
follow the browser's click/key prompt. Check actual sound separately from the
counter. Compare your [Main.java](../../teaching/checkpoints/12/media/Main.java)
and [Player.java](../../teaching/checkpoints/12/media/Player.java) after writing
your code. The API reference describes additional image and sound methods.

## 8. Optional stage 2: scroll a wider world

Keep editing this folder. Add a new `Camera.java` class with a private `double x`, `double x()` getter, and this method:

```java
public void follow(double playerX, double viewportWidth, double worldWidth) {
    x = Math.max(0, Math.min(playerX - viewportWidth / 2,
            worldWidth - viewportWidth));
}
```

Add `public double x() { return x; }` to Player. In Main add `private final double worldWidth = 1600;` and `private Camera camera;`. Create `camera = new Camera();` in `restart()` and move two coins farther away, for example x 840 and 1360. Pass `worldWidth` instead of `width()` to `player.update(...)`, then call `camera.follow(player.x(), width(), worldWidth);` after movement. To draw world objects, add overloads `Player.draw(GameApp app, double cameraX)`, `Player.drawImage(GameApp app, ImageRegion sprite, double cameraX)` and `Coin.draw(GameApp app, double cameraX)`. In each, use `x - cameraX` for the image or rectangle's horizontal drawing coordinate; keep the original methods and collection positions unchanged. In Main's `draw()`, pass `camera.x()` to those new methods. Zero ScoreDisplay and Restart stay outside the canvas and do not scroll. Check both world edges and collect a far coin. Compare your edits with the optional [scrolling checkpoint Main](../../teaching/checkpoints/12/scrolling/Main.java) and [Camera.java](../../teaching/checkpoints/12/scrolling/Camera.java), or the maintained [scrolling example](../examples/scrolling-game/README.md), then return to **your own code**.

## 9. Optional stage 3: add platforms and gravity

Continue the same game. Add a `Platform.java` with `x`, `y`, `width`, `height`, getters and `draw(GameApp app, double cameraX)` that calls `app.rect(x - cameraX, y, width, height)`. Main owns `private Platform[] platforms;` and creates ground and ledges in `restart()`, for example `new Platform(0, 300, 600, 20)` and `new Platform(700, 240, 180, 20)`. Draw each platform before the coins and player.

Move the coins near reachable ledges. In Player, add `private double velocityY; private boolean grounded = true;`. Keep the old `update(...)` for your top-down version. Add a new `updatePlatform(int horizontal, boolean jumpPressed, double seconds, double worldWidth, Platform[] platforms)` method. It moves x with the existing `speed`, clamps x to `worldWidth - size`, starts a jump only when `jumpPressed && grounded` (`velocityY = -460`), then on each frame applies `velocityY = Math.min(800, velocityY + 1200 * seconds); y += velocityY * seconds;`. Save the old bottom (`oldY + size`) before moving. When falling (`velocityY >= 0`), land only if the old bottom was at or above a platform top, the new bottom reaches it, and the player's horizontal range overlaps the platform. Landing sets `y = platform.y() - size`, `velocityY = 0`, `grounded = true`. Otherwise set `grounded = false`. In Main, replace only the movement call with `player.updatePlatform(horizontal, jumpPressed, seconds, worldWidth, platforms);`; compute a fresh Space press with a `private boolean jumpHeld` field so holding Space through landing does not jump again. After falling below the canvas, call `restart()` or show a loss. Test a landing, a gap, and a held jump. See the maintained [platform example](../examples/platform-game/README.md) for side and underside collision details if you extend this simple landing rule.

## 10. Optional stage 4: add levels and enemies

Add a `Level.java` that stores a `Platform[]`, `Coin[]`, spawn x/y and an exit x; its constructor creates the data for either level number 0 or 1. Main adds `private Level level; private int levelIndex;` and a `startLevel(int index)` method. That method sets `levelIndex = index`, constructs `level = new Level(index)` so coins are fresh, creates Player at `level.spawnX()`/`level.spawnY()`, assigns Main's `platforms` and `coins` from the new level, resets camera and displays the level number. `restart()` sets points and levelIndex to 0, then calls `startLevel(0)`. When every coin in the current level is collected and `player.x() >= level.exitX()`, call `startLevel(1)` from level 0; after level 1, enter the won state instead. Keep total score in Main and call `score.setScore(points)` when it changes. An optional `Enemy.java` can store x/y, move with an explicit `update(seconds)`, and expose `touches(Player)` using Player's existing contact method. Main owns an `Enemy[]`, explicitly updates/draws it, and decides whether a touch loses the current run. Check that entering a second level creates fresh coins and that the score display stays fixed while scenery moves. The maintained [level example](../examples/level-game/README.md) shows a complete reference with two levels.

## 11. Optional stage 5: add endings and Restart

Use `private boolean won; private boolean lost;` in Main. At the top of `update()`, use `if (won || lost) return;`; keep `draw()` running so the last scene and message remain visible. Finishing the last level sets won and a clear win message. Enemy contact or a fall sets lost and a clear loss message. In `restart()`, clear both flags, score and level index, then call `startLevel(0)` without creating controls again. Check win → frozen movement → Restart → first coin, and loss → frozen movement → Restart → first coin. The maintained [full-game source](../examples/full-game/README.md) is an advanced reference; inspect one method at a time and keep your own project and authored classes.

These optional stages are larger exercises. Use a new branch in your **own** project repository for an experiment, so you can return to the completed main version. Your study quiz and Coin game remain the two continuing practice projects, and an original shareable game is an optional separate fourth project. Return to the [lesson index](README.md).
