# Starter UI: maintained library proof

`libraries/starter-ui/` bundles StartScreen, Hud and ScoreDisplay. The same unchanged JAR is consumed by the study app and coin game. This is a maintained sample, not a new core API or automatic public release.

| Piece | Responsibility |
| --- | --- |
| [Library](../libraries/starter-ui/README.md) | Ordinary JavaFX UI classes, API, checks, MIT notice and source JAR |
| [Study consumer](../student-template/examples/packaged-study/README.md) | Question data, rules, session state and explicit UI updates |
| [Game consumer](../student-template/examples/packaged-game/README.md) | Player/coins, scoring, play/reset and explicit updates/drawing |
| [Teaching copies](../student-template/examples/composition-shared/README.md) | Separate readable source-extraction exercises |

Local coordinates: `ca.codepet.zero:starter-ui:0.1.0-prototype.1`. Java namespace: `zero.starterui`. ZeroHub adapts this fixture to its server-assigned `zero.uiN` namespace for integration proof. Neither coordinate is an alias for the other.

The sample depends on pinned JavaFX controls, not Zero core. It contains no Main, Player, Coin or Question. Hud contains ScoreDisplay and native controls; supplied actions call Main's methods. Each app creates its own instances and owns its own state.

```sh
python3 scripts/verify-starter-ui.py
```

The proof builds twice, checks reproducible binary/source JARs and MIT contents, uses a fresh isolated cache, runs native component checks and both consumers, and verifies runtime JAR origins. Logs/artifacts remain ignored. It executes trusted local source with normal permissions; remote uploads use the separate isolated checker.

For the complete generic library journey run `node scripts/verify-hub.mjs`. See [ZeroHub](COMPONENTS.md) and [development](DEVELOPMENT.md). No external checkout is needed.
