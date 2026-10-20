# 10. Reuse the score display

**First checkpoint: one class works in two projects you already wrote.**

![One ScoreDisplay class copied between the study quiz and Coin game, with a separate instance in each](visuals/10.svg)

Reopen your **Study quiz** from lesson 7 and your **Coin game** from lesson 9. These are your two existing tutorial repositories; lesson 10 has no starter download.

Previous: [Build a coin game](09-coin-game.md).

## 1. Extract the display from your study quiz

Open the `src/main/java/Main.java` you wrote in lesson 7. Main owns `points`, and its `refreshStats()` currently sets `scoreLabel.setText("Score: " + points);`. Create `src/main/java/ScoreDisplay.java` in that **study** folder:

```java
import javafx.scene.Node;
import javafx.scene.control.Label;

public class ScoreDisplay {
    private final Label label = new Label("Score: 0");

    public void setScore(int points) {
        label.setText("Score: " + points);
    }

    public Node view() {
        return label;
    }
}
```

## 2. Replace the study Main display calls

In study Main, change the field `private Label scoreLabel;` to `private ScoreDisplay score;`. In `setup()`, replace `scoreLabel = new Label();` with `score = new ScoreDisplay();` and place `score.view()` in the existing `VBox` where `scoreLabel` was. In `refreshStats()`, replace `scoreLabel.setText("Score: " + points);` with `score.setScore(points);`. Keep `points`, question rules, `Counter`, and Restart in Main.

## 3. Run App and test the study quiz

Run App: a wrong answer leaves score 0; answer `5` for the first question to reach 1; Restart returns to 0. The quiz has more questions; finish and restart it again.

The no-argument constructor creates one Label. `view()` returns its ordinary JavaFX Node for Main to place. `setScore(int)` changes its text. No framework registration, subclass or hidden update is involved.

## 4. Use the same class in your Coin game

Copy **your own** `ScoreDisplay.java` from the study folder into your existing Coin game's `src/main/java/`. Do not copy a new Main or Player. In the game's Main, change `private Label scoreLabel;` to `private ScoreDisplay score;`. In `setup()`, use `score = new ScoreDisplay();` and replace `scoreLabel` in the existing `HBox` with `score.view()`. In `restart()` and after `points++`, change each `scoreLabel.setText("Score: " + points);` to `score.setScore(points);`. For the reset line `scoreLabel.setText("Score: 0");`, use `score.setScore(points);` after setting `points = 0`.

## 5. Run App and test the Coin game

Leave the message Label and game rules in Main. Run App: collect a coin and stay on it (`Score: 1`), Restart during play (`Score: 0`), collect all three (`Score: 3`), then Restart after winning. Each running app has its own ScoreDisplay object and JavaFX Label. A JavaFX Node belongs to one parent, so you reuse the **class source**, not one live Label across windows.

## 6. Improve one class, then check both uses

Add `label.setStyle("-fx-font-weight: bold;");` in ScoreDisplay's constructor. The field initializer above creates the Label, so write an explicit constructor after the field:

```java
public ScoreDisplay() {
    label.setStyle("-fx-font-weight: bold;");
}
```

Copy that one changed class into the other project.

## 7. Run both apps and check the shared change

Run both. The score is bold in each, while all scoring and Restart behavior remains correct. If one project still looks unchanged, check which copy of `ScoreDisplay.java` you edited and rerun that project. After writing your own code, compare the [study Main](../../teaching/checkpoints/10/study/Main.java), [game Main](../../teaching/checkpoints/10/game/Main.java) and their identical [ScoreDisplay.java](../../teaching/checkpoints/10/study/ScoreDisplay.java).

ScoreDisplay owns presentation; each Main owns its score and rules. In [lesson 11](11-zerohub.md), use this boundary to evaluate a component locally before sharing original work.
