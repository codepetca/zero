# Starter UI: maintained library proof

`libraries/starter-ui/` bundles StartScreen, Hud and ScoreDisplay. The same unchanged JAR is consumed by the study app and coin game. This is a maintained sample, not a new core API or automatic public release.

| Piece | Responsibility |
| --- | --- |
| [Library](../libraries/starter-ui/README.md) | Ordinary JavaFX UI classes, API, checks, MIT notice and source JAR |
| [Study consumer](../student-template/examples/packaged-study/README.md) | Question data, rules, session state and explicit UI updates |
| [Game consumer](../student-template/examples/packaged-game/README.md) | Player/coins, scoring, play/reset and explicit updates/drawing |
| [Teaching copies](../student-template/examples/composition-shared/README.md) | Separate readable source-extraction exercises |

Local coordinates: `ca.codepet.zero:starter-ui:0.1.0-prototype.1`. Java namespace: `zero.starterui`. The former Hub fixture used an assigned namespace; that runtime is removed. The GitHub replacement derives student namespaces from numeric repository identity and slug. This maintained prototype is not a replacement catalog release.

The sample depends on pinned JavaFX controls, not Zero core. It contains no Main, Player, Coin or Question. Hud contains ScoreDisplay and native controls; supplied actions call Main's methods. Each app creates its own instances and owns its own state.

```sh
python3 scripts/verify-starter-ui.py
```

The proof builds twice, checks reproducible binary/source JARs and MIT contents, uses a fresh isolated cache, runs native component checks and both consumers, and verifies runtime JAR origins. Logs/artifacts remain ignored. It executes trusted local source with ordinary developer permissions. Hosted submitted-library execution remains closed behind its outstanding acceptance.

For the replacement consumption proof run `node scripts/verify-sharing-consumers.mjs --output .verification/sharing-consumers-new`. It checks two trusted helper consumers over scoped local HTTPS, not a public generic executor. See [ZeroHub](COMPONENTS.md) and [development](DEVELOPMENT.md). No external checkout or database is needed.
