# Coin game with the shared score display

Download the [fresh game component project](/generated/lessons/zero-lesson-10-game.zip), unzip it into its own folder, open it in VS Code and click **Zero → Run App**. Keep the sample local. It contains:

| From | To |
| --- | --- |
| `examples/coin-game-component/Main.java` | `src/main/java/Main.java` |
| `examples/coin-game/Player.java` | `src/main/java/Player.java` |
| `examples/coin-game/Coin.java` | `src/main/java/Coin.java` |
| `examples/shared/ScoreDisplay.java` | `src/main/java/ScoreDisplay.java` |

Copy ScoreDisplay unchanged: it is the same source used by the study app.
Keep the framework, Maven wrappers, `pom.xml` and `zero.json`. No resources,
Maven changes or installed community library are needed. Run App, or use
`./mvnw clean compile javafx:run` (`.\mvnw.cmd clean compile javafx:run` on Windows).

Click the canvas and move with arrows. The display starts at `Score: 0`; the
separate goal Label shows `Goal: 3 coins`. Each coin scores once. Collect all
three: `Score: 3`, the win message appears and movement stops. Restart after
one coin and after winning: score returns to 0, all coins return, and movement
resumes. Finish a second run. Restart requests canvas focus.

Main creates ScoreDisplay once in setup and puts `score.view()` in the bottom
HBox. After changing points, Main calls `score.setScore(points)` explicitly.
ScoreDisplay owns its Label; Main owns points, the goal and the win rule.
Player and Coin are the unchanged Lesson 9 classes. Neither the display nor
the game objects extend SimpleApp; Main extends SketchApp and hosts ordinary
JavaFX nodes around its canvas. See [Lesson 10](../../lessons/10-components.md).
