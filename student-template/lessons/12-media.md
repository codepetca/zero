# 12. Build a larger game

Assets → scrolling → platforms → levels → win/lose. Run each stage first.

## Before each stage

Stop. Back up Main/helpers **outside `src/`**. Keep `zero/`, wrappers,
`pom.xml` and `zero.json`. Copy listed Java files into `src/main/java/`, replacing
old versions; remove unlisted helpers. Keep **one Main**.
Save → Stop → Run App. Click the canvas for keys.

## 1. Your sprite and sound

Create `src/main/resources/media-demo/`. Copy:

| From | To |
| --- | --- |
| [media-demo/Main.java](../examples/media-demo/Main.java) | `src/main/java/Main.java` |
| [player.png](../examples/media-demo/resources/media-demo/player.png) | `src/main/resources/media-demo/player.png` |
| [chime.wav](../examples/media-demo/resources/media-demo/chime.wav) | `src/main/resources/media-demo/chime.wav` |

The starter includes JavaFX media. Older kit: add this inside `pom.xml`'s
`<dependencies>` **only if absent**; retain the pinned version:

```xml
<dependency>
  <groupId>org.openjfx</groupId>
  <artifactId>javafx-media</artifactId>
  <version>${javafx.version}</version>
</dependency>
```

**Check:** see the robot. Click **Play sound** twice: hear chimes; see `Plays: 2`.
Each click replaces the effect. The counter cannot prove audibility; check device/volume.

`setup()` loads Image/AudioClip once. Draw reuses the image; an action plays sound.
Paths starting `/` begin at `src/main/resources/`. Resource errors name their path.

**Change:** replace the PNG and short **16-bit PCM WAV**; rerun. Keep names or
change Main's paths too. Adjust its 96×96 drawing or `sound.setVolume(0.25)`
(volume 0–1). Keep these resources throughout; later players draw at 32×32.

## 2. A scrolling world and fixed score

From [scrolling-game](../examples/scrolling-game/README.md), copy **Main.java,
Camera.java, Player.java and Coin.java**. Add unchanged
[shared/ScoreDisplay.java](../examples/shared/ScoreDisplay.java). Keep both resources.

**A/D or Left/Right** moves. Canvas: 640×360; world: 1600×360. Camera.follow
centres the view and clamps its offset:

```java
x = Math.max(0, Math.min(centreX - viewportWidth / 2,
        Math.max(0, worldWidth - viewportWidth)));
```

Drawing subtracts this offset from world positions; native score/message stay fixed.

**Check:** move right: scenery scrolls, HUD stays fixed. Each coin scores once.
Reach both world edges.

**Change:** adjust Camera.follow's `viewportWidth / 2`; compare scrolling.

## 3. Gravity, platforms and collisions

From [platform-game](../examples/platform-game/README.md), replace **Main.java,
Camera.java, Player.java and Coin.java**; add **Platform.java**. Keep unchanged
**ScoreDisplay.java** and both resources.

**Space or Up** jumps on a new grounded press. Player uses steps of at most
1/120 second, adds gravity, moves and resolves collisions:

```java
velocityY = Math.min(800, velocityY + 1200 * step);
y += velocityY * step;
```

**Check:** jump onto a platform, hit its underside and side, then land. Hold jump
through a landing: no extra jump. Fall into a gap: the stage resets.

**Change:** adjust gravity in Player, rerun and compare jump height and falling.

## 4. Enemies and two levels

From [level-game](../examples/level-game/README.md), replace **Main.java,
Camera.java, Player.java, Coin.java and Platform.java**; add **Level.java and
Enemy.java**. Keep unchanged **ScoreDisplay.java** and both resources.

Level holds ordinary arrays of platforms, coins and enemies, for example:

```java
new Coin[] { new Coin(120, 268), new Coin(300, 198),
    new Coin(850, 198), new Coin(1360, 268) }
```

Collect every coin before touching the exit.

**Check:** exit early: stay in the level. Finish level 1: enter level 2 with its
score banked. Touch an enemy or fall: restart the current level, restore its
coins and lose only its unbanked points. Finish level 2: begin a fresh two-level run.

**Change:** move one platform or enemy in Level's arrays; rerun and test its effect.

## 5. Win, lose and restart

From [full-game](../examples/full-game/README.md), replace all seven files:
**Main.java, Camera.java, Player.java, Coin.java, Platform.java, Level.java and
Enemy.java**. Keep unchanged **ScoreDisplay.java** and both resources.

Main owns playing/won/lost state. Its update begins:

```java
if (won || lost) return;
```

Drawing continues. Native **Restart** creates a fresh run.

**Check:** an enemy or fall shows a loss and freezes movement. Restart restores
level 1, player, enemies, coins and zero score. Finish both levels: win and freeze.
Restart after winning and collect a coin again. Click the canvas to resume keys.

**Change:** change the win/loss message in Main; demonstrate both endings.

Previous: [Share a component](11-community.md). Return to the [lesson index](README.md).
