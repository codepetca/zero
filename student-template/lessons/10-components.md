# 10. Make a reusable component

Use one ScoreDisplay class in two apps, then improve its presentation.

## Start with the display in Main

Back up [your coin game](09-coin-game.md) outside `src/`. Follow
[the switching steps](README.md#before-each-lesson). Copy exactly:

| From | To |
| --- | --- |
| [examples/quiz/Main.java](../examples/quiz/Main.java) | `src/main/java/Main.java` |
| [examples/shared/ScoreDisplay.java](../examples/shared/ScoreDisplay.java) | `src/main/java/ScoreDisplay.java` |

This is the **scored quiz**, with answer `42`. Run it unchanged: wrong answers
keep `Score: 0`; `42` gives `Score: 10` and disables Check answer.

In your copied Main, temporarily bring the display back into the app:

| Replace | With |
| --- | --- |
| `private ScoreDisplay score;` | `private Label scoreLabel;` |
| `score = new ScoreDisplay();` | `scoreLabel = new Label("Score: 0");` |
| `score.view()` in the VBox | `scoreLabel` |
| `score.setScore(points);` | `scoreLabel.setText("Score: " + points);` |

Run: wrong answer keeps 0; `42` shows 10. Main now owns both the rule and display.

## Extract the display

Create `src/main/java/ScoreDisplay.java` with this ordinary class:

```java
import javafx.scene.Node;
import javafx.scene.control.Label;

public class ScoreDisplay {
    private final Label label;
    private final String caption;

    public ScoreDisplay() {
        this("Score");
    }

    public ScoreDisplay(String caption) {
        this.caption = caption;
        label = new Label(caption + ": 0");
    }

    public void setScore(int points) {
        label.setText(caption + ": " + points);
    }

    public Node view() {
        return label;
    }
}
```

Restore the original scored quiz Main, reversing the four replacements above.
Run the same checks. Main owns `points` and decides when to award them. After `points += 10`, Main
calls `score.setScore(points)`. ScoreDisplay only displays the supplied number.
`view()` gives Main the label to place in its VBox. No component parent class or
registration is needed.

## Reuse it

Stop the quiz and back up its Main outside `src/`. Replace only
`src/main/java/Main.java` with [examples/practice/Main.java](../examples/practice/Main.java).
Keep the **same** ScoreDisplay file. Run the tracker: Complete, Complete, Reset,
Complete should show `Completed: 1`, `2`, `0`, `1`.

Here Main owns `completed` and explicitly calls `setScore(completed)` after each
change. `new ScoreDisplay("Completed")` supplies a different caption. Each app
creates its own instance; one JavaFX node can have only one parent.

## Improve one thing

In your copied `src/main/java/ScoreDisplay.java`, add this line immediately after
`label = new Label(caption + ": 0");`:

```java
label.setStyle("-fx-font-weight: bold;");
```

Keep both constructors, `view()` and `setScore(int)` unchanged. The quiz still
needs `new ScoreDisplay()`. The tracker still needs its caption constructor.
Save your improved class outside `src/`; keep the original example shelf intact.

Run the tracker, then switch only Main back to the scored quiz. Use the exact
same improved ScoreDisplay in both. Stop and run again after each edit.

| Check | Expected |
| --- | --- |
| Tracker starts | Bold `Completed: 0` |
| Complete twice, Reset, Complete | Bold counts `1`, `2`, `0`, `1` |
| Quiz starts; enter a wrong answer | Bold `Score: 0`; retry allowed |
| Enter `42`; try to check again | Bold `Score: 10`; button disabled |
| Stop and rerun quiz | `Score: 0`; button enabled |

Record what happened and your OS. Explain which class owns each rule and why
the same class works with two captions. Your source copy is a learning component;
it is not an installed community library.

Previous: [9. Collect the coins](09-coin-game.md). Next:
[11. Share a component](11-community.md).
