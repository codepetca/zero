# 7. Build a study app

**First checkpoint: retry and score once.**

![One integer division question with answer 3, disabled Check answer, correct feedback and Score: 1](visuals/07.svg)

Target illustration: the first question answered correctly. More session stages follow.

1. Follow the [safe switching steps](README.md#before-each-lesson).
2. In [stage 1](#1-check-retry-score-once), copy Question and ScoreDisplay, then its complete Main; **Run App**.
3. Try `4`, then ` 3 `. Click **Check answer** each time.

**Done:** Wrong answers allow retry; the correct answer shows **Score: 1** and disables checking.

Build from one question to a complete session.
Previous: [Objects](06-objects.md).

## 1. Check, retry, score once

Stop the app and back up Main and helpers outside `src/`. Remove unlisted
example helpers; keep `src/main/java/zero/`.
Copy [Question.java](../examples/study/Question.java) and the unchanged
[ScoreDisplay.java](../examples/shared/ScoreDisplay.java) into `src/main/java/`.
Replace `src/main/java/Main.java` with this complete first stage:

```java
import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    private final Question question = new Question(
            "What is the value of 7 / 2 when both numbers are ints?", "3",
            "Integer division drops the fractional part.");
    private boolean answered;
    private TextField answer;
    private Label feedback;
    private Button check;
    private ScoreDisplay score;

    @Override public void settings() {
        title("One study question");
        size(580, 340);
    }

    @Override public void setup() {
        var prompt = new Label(question.prompt());
        prompt.setWrapText(true);
        answer = new TextField();
        feedback = new Label();
        feedback.setWrapText(true);
        check = new Button("Check answer");
        score = new ScoreDisplay();
        check.setOnAction(event -> checkAnswer());
        answer.setOnAction(event -> checkAnswer());
        var screen = new VBox(12, prompt, answer, check, feedback, score.view());
        screen.setPadding(new Insets(20));
        show(screen);
    }

    private void checkAnswer() {
        if (answered) return;
        if (question.accepts(answer.getText())) {
            answered = true;
            score.setScore(1);
            feedback.setText("Correct! " + question.explanation());
            answer.setDisable(true);
            check.setDisable(true);
        } else {
            feedback.setText("Try again. You can retry without losing points.");
        }
    }

    public static void main(String[] args) { launch(args); }
}
```

Run App. Predict, then test: blank → `4` → ` 3 ` → Check again.
Wrong answers allow retry. Correct answers score once. `Question.accepts(...)`
trims spaces and ignores case; `answered` prevents duplicate scoring.

## 2. Add Next and completion

Stop and back up your first stage outside `src/`. Keep only `zero/` and the
three files for this app in `src/main/java/`:

| From | To |
| --- | --- |
| [study Main.java](../examples/study/Main.java) | `src/main/java/Main.java` |
| [Question.java](../examples/study/Question.java) | `src/main/java/Question.java` |
| [shared ScoreDisplay.java](../examples/shared/ScoreDisplay.java) | `src/main/java/ScoreDisplay.java` |

Copy the complete program unchanged, including its Restart button. Save, Stop
and Run App. Try Next before answering: it stays disabled. Answer `3`, then Next;
answer `true`, then Next; answer `0`, then Next. The app finishes with score 3
and tells you to choose Restart.

Read `checkAnswer()`, `nextQuestion()` and `showQuestion()` in Main.
`Question[]` holds the data. `questionIndex` selects it; `points` counts correct
questions; `answered` locks one question; `finished` locks the completed session.
These are fields because several methods share them. Each Next clears the old
answer and relocks Next until the new answer is correct.

## 3. Trace and test Restart

Keep the complete program from stage 2. Answer one question and choose Restart;
finish all three and choose Restart again. Both times expect question 1, score 0,
empty input and disabled Next. Try an incorrect answer, then `3` in the new
session: the score becomes 1 again.

Find the Restart handler in `setup()`: it calls `restartSession()`.
That method resets the fields, updates ScoreDisplay and calls `showQuestion()`.
The existing controls are reused. Restart does not call `setup()` or create a
second interface. `showQuestion()` also requests focus for the answer field so
you can type the next answer.

The final copy remains the three files above. No Maven or framework changes are
needed. Main owns the points and session rules; `score.setScore(points)` explicitly
updates the ordinary ScoreDisplay object.

## 4. Add your fourth question

In Main's `questions` array, put a comma after the third Question, then add:

```java
new Question("What is 9 % 4?", "1", "The remainder after division is 1.")
```

Keep the array's closing `};`. Run the whole session: `3`, ` TRUE `, `0`, `1`.
Expect “Question 4 of 4”, then completion with score 4. Restart and try a wrong
answer before finishing a second run. Replace the fourth prompt, answer and
explanation together with your own question. `questions.length` makes navigation
and the summary follow the new total.

Next: [Move a player](08-movement.md).
