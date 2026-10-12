# Coin game with the same shared start and HUD views

Stop the app. Back up Main and every helper, including edited components, outside
`src/`. Remove unlisted example helpers from `src/main/java/`, preserving `zero/`.
Keep build files, Maven wrappers, `pom.xml` and `zero.json`. Copy these exact
files (paths are relative to the starter folder):

| From | To |
| --- | --- |
| `examples/composed-game/Main.java` | `src/main/java/Main.java` |
| `examples/coin-game/Player.java` | `src/main/java/Player.java` |
| `examples/coin-game/Coin.java` | `src/main/java/Coin.java` |
| `examples/composition-shared/StartScreen.java` | `src/main/java/StartScreen.java` |
| `examples/composition-shared/Hud.java` | `src/main/java/Hud.java` |
| `examples/shared/ScoreDisplay.java` | `src/main/java/ScoreDisplay.java` |

Player, Coin and ScoreDisplay are existing canonical sources, not duplicates in
this directory. StartScreen and Hud are exactly the sources used by
[the composed study app](../composed-study/README.md). First copy all helpers
unchanged to compare reuse. If you edited a component, preserve its backup and
deliberately reuse that edited source in both apps instead of overwriting it.
No resources, Maven changes or installed Community library are needed.

Run App, or run `./mvnw clean compile javafx:run` from the starter folder
(`.\mvnw.cmd clean compile javafx:run` on Windows).

The welcome sits beside the visible canvas; Hud is already below it with Restart
disabled. Before Start, clicking the canvas and holding arrows must not move the
player or collect coins. Choose Start: the welcome disappears and the same Hud
enables Restart with `Score: 0`. Move with arrows, clicking the canvas if needed. Each coin scores
once. Collect three: the final message appears and movement/scoring stop.
Restart after one coin and after winning: score returns to zero, the three coins
return and movement resumes. Complete a second run. Restart requests canvas focus.

Main creates StartScreen and Hud once. Start and Restart call Main's `restart()`.
It resets game objects and fields once, enables and updates Hud, and requests canvas focus;
it keeps the same Hud instance. New Player/Coin instances make each run's state
fresh. Main owns playing/won, movement, scoring and the win rule. Hud supplies no
game logic. `update(seconds)` explicitly returns when playing is false or won
is true, including before Start. `draw()` keeps rendering but never awards points.

SketchApp extends SimpleApp. This example always keeps the canvas in
`layout().getCenter()`, uses the left panel for StartScreen and the bottom for Hud.
It does not call inherited `show(...)` to hide the canvas: doing that would leave
the sketch timer running. Focus loss clears held input but does not pause rules.
Each running app creates separate component instances because a node has one
parent. See [the shared view contract](../composition-shared/README.md) for
Runnable/lambdas. Try long instructions and feedback; the native labels wrap.

These are local source-copy examples, not a published Community package or
evidence of physical Windows/Linux or novice classroom testing.
