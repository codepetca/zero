# Coin game using a package

Local maintainer prototype. This is the composed coin game with imports for the
same Starter UI JAR used by [the study app](../packaged-study/README.md). Main owns
play/win/reset state. Player and Coin remain app source; the package contains UI.

## Run the local proof

From the Zero source checkout:

```sh
python3 scripts/verify-starter-ui.py --community-root /path/to/zero-community
```

The command builds/checks the library, then both consumers in disposable projects.
It uses a fresh isolated Maven cache and the bundled wrapper. Maintainer Python,
a JDK and first-time dependency network access are needed. Nothing is installed
into your normal cache or uploaded. The public catalog and Workshop cannot add
this prototype yet.

## Exact consumer files

- This folder's Main.java → `src/main/java/Main.java`.
- [Player.java](../coin-game/Player.java) → `src/main/java/Player.java`.
- [Coin.java](../coin-game/Coin.java) → `src/main/java/Coin.java`.
- Preserve the existing `zero/` framework source, wrapper and build files.

Stop and back up Main and helpers outside `src/`. Remove unlisted example helpers
only after backing up. Preserve resources/build files and save your edited source
components; do not shadow the library with default-package Hud, StartScreen or
ScoreDisplay classes.

The proof adds the exact local dependency:

```xml
<dependency>
  <groupId>ca.codepet.zero.community</groupId>
  <artifactId>starter-ui</artifactId>
  <version>0.1.0-prototype.1</version>
</dependency>
```

This coordinate is unpublished and only exists in the proof's local cache. A
normal downloaded starter cannot resolve it until an intentional public release.

Check Start → collect three coins → win → Restart. The canvas remains mounted
and Main explicitly gates updates. Both consumers load all three widgets from
one unchanged JAR; neither includes package source or a second Application.

For readable source-copy teaching, use [composed-game](../composed-game/README.md).
