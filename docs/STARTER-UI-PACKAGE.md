# Starter UI: local package proof

Owner approved the next bounded step: package the tested StartScreen, Hud and
ScoreDisplay and consume one unchanged JAR in the study app and coin game.
No publication, core API change or general Workshop/catalog implementation here.

## Boundaries

| Piece | Source | Responsibility |
| --- | --- | --- |
| Package | Zero Community `packages/starter-ui/` | Three ordinary JavaFX UI classes, API card, meaningful checks, MIT notice and source JAR |
| Study consumer | [packaged-study](../student-template/examples/packaged-study/README.md) | Question data, correct-answer/retry rules, session state and explicit UI updates |
| Game consumer | [packaged-game](../student-template/examples/packaged-game/README.md) | Player/coins, scoring, play/win/reset and explicit updates/drawing |
| Teaching copies | [composition-shared](../student-template/examples/composition-shared/README.md) | Readable default-package source exercises; deliberately separate from installed library classes |

Coordinates: `ca.codepet.zero.community:starter-ui:0.1.0-prototype.1`.
Java namespace: `zero.community.starterui`. The Java namespace prevents class-name
collisions; the Maven coordinate identifies the versioned distribution.
This local qualifier is an exact pin, not a released version or floating SNAPSHOT.

The package depends on pinned JavaFX controls, not Zero core. It contains no
Main, SimpleApp, SketchApp, Player, Coin or Question classes. Hud contains a
ScoreDisplay and native controls; constructor actions call Main's methods.
Instances are created once and updates remain explicit. Consumers can combine
this library with other libraries in ordinary JavaFX layouts.

## Run

From the Zero source checkout with the matching local Community source:

```sh
python3 scripts/verify-starter-ui.py --community-root /path/to/zero-community
```

The proof builds twice, verifies reproducible binary/source JARs and source/license
contents, installs only into its fresh isolated cache and runs native component
checks plus both exact consumers. Runtime checks bind the loaded classes to that
exact installed JAR. Logs/artifacts stay in an ignored proof folder. No upload,
normal-cache installation or default student POM change occurs.

Only trusted locally developed source is executed, with normal process permissions.
This maintainer proof is not a sandbox for submissions or a new installed-IDE action.
Students will use a published package through normal Maven resolution after a
separate reviewed release; they do not need the maintainer Python tool.

## Next contracts to prove

This package exercises grouping and composition. Discovery still needs to connect
each class to its containing library/version, its previews, API and two consumers.
The current Community catalog supports one library, and Workshop accepts its two
health bars. Neither supports Starter UI yet. The local package is not admitted,
recommended, accepted or made publicly discoverable by this proof.

Next: use this concrete package to design a narrow generic Workshop descriptor,
source-bound checks and previews, then extend the existing catalog for separate
library identities. Keep Maven resolution, immutable version pins and independent
maintainer acceptance. Preserve current public artifacts and old assignments.
