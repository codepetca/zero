# Study app using a package

Local maintainer prototype. This is the composed study app with imports for the
three-class Starter UI library. It does not copy StartScreen, Hud or ScoreDisplay
into the app. The same exact JAR is also used by [the game](../packaged-game/README.md).
Main keeps the question, scoring and session rules; Question remains app source.

## Run the local proof

From the Zero source checkout, use the maintained library in `libraries/starter-ui`:

```sh
python3 scripts/verify-starter-ui.py
```

This builds the package and runs both consumers in disposable projects with an
isolated Maven cache. It requires maintainer Python and a JDK, uses the bundled
Maven wrapper and needs network access for first-time pinned dependencies.
It does not change your app, install to your normal Maven cache or upload anything.
The standalone coordinate is local and unpublished. ZeroHub uses its own reserved
library coordinate for the same source.

## Exact consumer files

For the proof, copy only:

- This folder's Main.java → `src/main/java/Main.java`.
- [Question.java](../study/Question.java) → `src/main/java/Question.java`.
- The existing readable `zero/` framework source, wrapper and build files.

Stop and back up your existing Main and helpers outside `src/` first. Remove
unlisted example helpers only after backing up. Preserve `zero/`, resources and
build files. Keep your edited source components in the backup; do not shadow the
library with default-package Hud, StartScreen or ScoreDisplay classes.

The generated proof POM adds this exact dependency:

```xml
<dependency>
  <groupId>ca.codepet.zero</groupId>
  <artifactId>starter-ui</artifactId>
  <version>0.1.0-prototype.1</version>
</dependency>
```

That coordinate is local and unpublished; pasting it into an ordinary downloaded
starter will not make it available. The proof supplies its isolated local cache.
Future catalog installation needs a separately verified public artifact release.

Check Start → answer/retry → Next → completion → Restart. The checker confirms
the widgets came from the exact installed JAR, not accidentally copied classes.

For the readable source-copy lesson, use [composed-study](../composed-study/README.md).
