# 12. Build a larger game

**First checkpoint: show a sprite and play a sound.**

![Purple robot on an AliceBlue canvas above Play sound and Plays: 2 controls](visuals/12.svg)

Target illustration: the supplied robot after two sound clicks. Larger stages follow.

1. [Start this lesson in a fresh project](README.md#start-a-lesson).
2. Open the included Main and two media resources in the fresh project; **Run App**.
3. Click **Play sound** twice; listen and watch the counter.

**Done:** See the robot and **Plays: 2**; hear the chimes. The counter alone cannot check audio.

Assets → scrolling → platforms → levels → win/lose. Run each stage first.

## Before each stage

Each stage has a fresh project. Download its ZIP below or choose the same stage
under **Zero: Start lesson**. Open the new folder and click **Run App**. Click
the canvas for game keys. Keep every stage local.

## 1. Your sprite and sound

The fresh Lesson 12 project already includes:

| From | To |
| --- | --- |
| [media-demo/Main.java](../examples/media-demo/Main.java) | `src/main/java/Main.java` |
| [player.png](../examples/media-demo/resources/media-demo/player.png) | `src/main/resources/media-demo/player.png` |
| [chime.wav](../examples/media-demo/resources/media-demo/chime.wav) | `src/main/resources/media-demo/chime.wav` |

**Check:** see the robot. Click **Play sound** twice: hear chimes; see `Plays: 2`.
Each click replaces the effect. The counter cannot prove audibility; check device/volume.

`setup()` loads Image/AudioClip once. Draw reuses the image; an action plays sound.
Paths starting `/` begin at `src/main/resources/`. Resource errors name their path.

**Change:** replace the PNG and short **16-bit PCM WAV**; rerun. Keep names or
change Main's paths too. Adjust its 96×96 drawing or `sound.setVolume(0.25)`
(volume 0–1). Keep these resources throughout; later players draw at 32×32.

## 2. A scrolling world and fixed score

[Start Scrolling world](https://zero.codepet.ca/generated/lessons/zero-lesson-12-scrolling.zip).
It includes Main, Camera, Player, Coin, unchanged ScoreDisplay and both resources.
See [scrolling-game](../examples/scrolling-game/README.md) for the complete file list.

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

[Start Platforms and gravity](https://zero.codepet.ca/generated/lessons/zero-lesson-12-platforms.zip).
It includes Main, Camera, Player, Coin, Platform, unchanged ScoreDisplay and both
resources. See [platform-game](../examples/platform-game/README.md).

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

[Start Enemies and levels](https://zero.codepet.ca/generated/lessons/zero-lesson-12-levels.zip).
It includes Main, Camera, Player, Coin, Platform, Level, Enemy, unchanged
ScoreDisplay and both resources. See [level-game](../examples/level-game/README.md).

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

[Start Win, lose and restart](https://zero.codepet.ca/generated/lessons/zero-lesson-12-full.zip).
It includes Main, Camera, Player, Coin, Platform, Level, Enemy, unchanged
ScoreDisplay and both resources. See [full-game](../examples/full-game/README.md).

Main owns playing/won/lost state. Its update begins:

```java
if (won || lost) return;
```

Drawing continues. Native **Restart** creates a fresh run.

**Check:** an enemy or fall shows a loss and freezes movement. Restart restores
level 1, player, enemies, coins and zero score. Finish both levels: win and freeze.
Restart after winning and collect a coin again. Click the canvas to resume keys.

**Change:** change the win/loss message in Main; demonstrate both endings.

Previous: [Share a component](11-zerohub.md). Return to the [lesson index](README.md).
