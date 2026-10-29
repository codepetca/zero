# Coin game with the shared score display

This is an optional complete source reference. For the continuing lessons,
read one method at a time and add the idea to your own existing Game code.
To run the whole reference, make a separate local copy of the starter in another
folder and copy only the files listed below into that new copy. Open that folder
in VS Code and click **Zero → Run App**. Keep your lesson project as it is; no
complete example project ZIP is required. The reference files are:


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
Player and Coin are the unchanged Lesson 6 classes. Neither the display nor
the game objects extend App; Main extends GameApp and hosts ordinary
JavaFX nodes around its canvas. See [Lesson 9](../../lessons/10-components.md).
