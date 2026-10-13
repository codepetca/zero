# 10. Reuse one component in an app and a game

**First checkpoint: run ScoreDisplay.**

![The same ScoreDisplay.java source used in a study app and beneath a coin-game canvas](visuals/10.svg)

Target illustration: separate instances in study and game.

1. [Start a fresh Lesson 10 project](README.md#start-a-lesson).
2. Open [stage 1's three files](#1-find-the-component-boundary) in the fresh project; **Run App**.
3. Answer `3`, choose **Restart**, then find `score.setScore(points)` in Main.

**Done:** Score goes **1 → 0**. Reuse it beneath the canvas in stage 2.

A component can be an ordinary Java object that presents part of an interface.
Use the same ScoreDisplay source in your study app and coin game.

## 1. Find the component boundary

The fresh Lesson 10 project already contains these exact files:

| From | To |
| --- | --- |
| [study Main.java](../examples/study/Main.java) | `src/main/java/Main.java` |
| [Question.java](../examples/study/Question.java) | `src/main/java/Question.java` |
| [shared ScoreDisplay.java](../examples/shared/ScoreDisplay.java) | `src/main/java/ScoreDisplay.java` |

Run the complete study app. A wrong answer keeps `Score: 0`; `3` gives `Score: 1`.
Next moves to question 2. Restart returns to question 1 and `Score: 0`.

Read [ScoreDisplay.java](../examples/shared/ScoreDisplay.java). Its constructor
creates a Label. `setScore(int)` changes that Label; `view()` returns its node
for Main to place in a layout. Main creates the display once in `setup()`, places
`score.view()` in its VBox, and calls `score.setScore(points)` after changing
points. Question holds question data; Main owns the retry, score and session rules.

`view()` is our example's ordinary method name, a useful convention for returning
an interface node. JavaFX and Zero do not discover or register the object.
ScoreDisplay is not a SimpleApp subclass: Main starts the app and places its node.
The display's constructor and methods are the part another app needs to know.

## 2. Use the same display beneath a game canvas

For the game, choose **Reuse the component in a game** under **Zero: Start lesson**
or download its [fresh project](/generated/lessons/zero-lesson-10-game.zip).
Open that folder separately and click **Run App**. It contains:

| From | To |
| --- | --- |
| [coin-game-component Main.java](../examples/coin-game-component/Main.java) | `src/main/java/Main.java` |
| [coin-game Player.java](../examples/coin-game/Player.java) | `src/main/java/Player.java` |
| [coin-game Coin.java](../examples/coin-game/Coin.java) | `src/main/java/Coin.java` |
| [the same shared ScoreDisplay.java](../examples/shared/ScoreDisplay.java) | `src/main/java/ScoreDisplay.java` |

Keep ScoreDisplay unchanged. Open the game project folder in VS Code and click Run App.

Main now extends SketchApp. It creates the same `new ScoreDisplay()` once in
`setup()` and puts `score.view()` in an HBox through `layout().setBottom(...)`.
SketchApp provides the canvas and hosts ordinary JavaFX controls around it.
The display does not need another app window or a different parent class.

Main still owns `points` and calls `score.setScore(points)` after collection and
Restart. A separate goal Label shows how many coins are needed; that goal and
the win rule belong to the game. Player and Coin are unchanged Lesson 9 classes.
Main explicitly updates Player and draws Player/Coins each frame. It updates
ScoreDisplay only when points change.

Check these results:

| Action | Expected |
| --- | --- |
| Start | `Score: 0`, `Goal: 3 coins` |
| Collect one coin; stay there, leave and return | `Score: 1` throughout |
| Restart during play | Score 0, all coins and original player position |
| Collect all three | Score 3, win message and frozen movement |
| Restart after winning; collect again | Score 0, then 1; movement resumes |

Each running app creates its own ScoreDisplay instance. Reusing a class means
using the same source to create objects; a JavaFX node can have only one parent.
Restart reuses the display and controls and resets the game objects. It requests
canvas focus so game keys resume; click the canvas after switching windows.

## 3. Improve presentation and verify both uses

In your copied `src/main/java/ScoreDisplay.java`, add this line immediately after
`label = new Label(caption + ": 0");`:

```java
label.setStyle("-fx-font-weight: bold;");
```

Keep both constructors, `view()` and `setScore(int)` unchanged. Copy your improved class into both fresh Lesson 10 projects, then run the game
checks above. Open the study project in its own VS Code window and run its checks:
wrong answer → 0, `3` → 1, Restart → 0. Both apps should show bold scores.

Explain why presentation changes belong in ScoreDisplay and scoring changes
belong in Main. Record your actual results and OS. This source copy is a learning
component; it is not an installed community library.

For an optional extraction exercise, [EXERCISES.md](../EXERCISES.md) steps 3–5
show moving the scored quiz's Label into ScoreDisplay and reusing it in the
practice tracker. Its `new ScoreDisplay("Completed")` caption also works without
changing the original no-argument constructor. You can propose your compatible
improvement in the next lesson.

Previous: [9. Collect the coins](09-coin-game.md). Next:
[11. Share a component](11-zerohub.md).
