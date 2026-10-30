# One coin and native controls

For this checkpoint, work in a fresh Lesson 9 project. The complete controls stage has these files:

| From | To |
| --- | --- |
| `examples/coin-game-controls/Main.java` | `src/main/java/Main.java` |
| `examples/coin-game/Player.java` | `src/main/java/Player.java` |
| `examples/coin-game/Coin.java` | `src/main/java/Coin.java` |

Keep the framework, Maven wrappers, `pom.xml` and `zero.json`. No resources or
Maven changes are needed. Run App, or use `./mvnw clean compile javafx:run`
(`.\mvnw.cmd clean compile javafx:run` on Windows) from the starter folder.

Move with arrows. Collect the coin: `Score: 0 / 1` becomes `Score: 1 / 1`.
Stay there, leave and return: it stays 1. Movement continues after collection.
Choose Restart before and after collecting: expect the player at (40, 180),
the coin at (220, 180), score 0 and the original message. Collect again.
Restart requests canvas focus; click the canvas if keys are inactive.

`setup()` creates Labels, Button and HBox once. `layout().setBottom(controls)`
places ordinary JavaFX controls beneath the canvas. Main owns the number and
explicitly updates the score Label after collection and reset. Coin owns its
collected flag. Restart creates fresh game objects and reuses the controls;
it does not call setup. See [Lesson 9 stage 3](https://zero.codepet.ca/tutorials/9#3-add-native-controls-and-restart).
