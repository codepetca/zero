# Reach the coin

Hold the arrow keys to move the blue square. Touch the fixed gold square to win;
even touching an edge or corner counts. Both squares stay visible, and movement
freezes after a win. Press R to restart at the same starting position. You can
restart before or after winning; holding R keeps resetting, so release it to move.
Opposite arrows cancel each other. Two arrows move diagonally.

Click anywhere on the canvas before using the keys. If you switch to another
window, return and click the canvas again. Keys belong to the focused canvas.

## Copy and run

Use a standalone Zero starter folder containing `pom.xml`, `mvnw`, `mvnw.cmd`
and `src/`. Keep a copy of your current app first. Copy **only** this example's
`Main.java` and `Player.java` into `src/main/java/`, replacing Main and any old
Player. Keep `src/main/java/zero/` and the starter build files unchanged. This
example needs no `ScoreDisplay.java`; that default quiz helper may stay there.
Do not mix in a Main or Player from another example.
If your downloaded kit does not have this example, copy the complete files shown
on the website's [Reach the coin page](https://zero.codepet.ca/examples/reach-the-coin)
into those same destinations.

Open that standalone starter folder in VS Code and click **Zero → Run App**.
Alternatively, open a terminal in that folder and run:

```sh
# macOS or Linux
./mvnw clean compile javafx:run
```

```powershell
# Windows PowerShell
.\mvnw.cmd clean compile javafx:run
```

A supported JDK 17+ is required. The first run needs internet to download the
starter's pinned Maven and JavaFX dependencies. Close the game window to stop;
save edits and run again to rebuild. This example remains outside `src/` until
you copy it, so the starter's default quiz is unchanged.

For a repository checkout, run `node scripts/prepare-starter.mjs` from the
repository root first to assemble the framework sources, then use a disposable
copy of `student-template/` as the standalone folder. An extracted starter
already contains those sources and does not need Node.js or preparation.

## Follow the code

`Main` owns the player, fixed coin coordinates and `won` flag. Each frame calls
`update(seconds)` and then `draw()`. Main reads the keys and explicitly calls
`player.update(...)` and `player.draw(this)`. `Player` is an ordinary object with
position, size and speed fields; it clamps its position and tests rectangle
contact. No object updates itself automatically.

## Two tiny changes

1. Change `speed` in Player from `180` to `120`. Run again and compare movement.
2. Change `coinY` in Main from `180` to `300`. Run again and reach the lower coin.

Maintainer verification and its platform limits are in [checks/README.md](checks/README.md).

The palette and two font fields in Main, plus `color` in Player, control the
appearance. They are ordinary JavaFX values; fonts are created once and reused
in draw. See [the beginner toolkit](../../BEGINNER.md) and
[appearance guide](../../STYLE.md) for small sets of methods to learn first.
