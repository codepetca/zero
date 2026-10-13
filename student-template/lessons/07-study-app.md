# 7. Build a study app

**Turn your quiz into a three-question session.**

![First question answered correctly, with Next ready and Score: 1](visuals/07.svg)

Target illustration: question 1 answered correctly after one wrong try.

1. Open the **same Study project** from lessons 3–6. Keep its `Counter.java` and `Main.java`.
2. Add a `Question` class and a small array of questions. Add Next, Restart and score controls to Main.
3. Click **Run App**. Try a wrong answer, then a right answer; finish the three questions and restart.

**Done:** A wrong answer allows retry. Each question adds at most one point; Next reaches the next question or completion; Restart returns to question 1 with score and attempts at zero.

## 1. Give each question its own data

Create `src/main/java/Question.java` beside Main and Counter. Write this
ordinary Java class. Its `accepts(...)` method ignores surrounding spaces and
letter case, so ` TRUE ` can answer `true`.

```java
public class Question {
    private final String prompt;
    private final String answer;
    private final String explanation;

    public Question(String prompt, String answer, String explanation) {
        this.prompt = prompt;
        this.answer = answer;
        this.explanation = explanation;
    }

    public String prompt() { return prompt; }
    public String explanation() { return explanation; }
    public boolean accepts(String response) {
        return answer.equalsIgnoreCase(response.trim());
    }
}
```

## 2. Add session state to your existing Main

Keep the `Counter attempts`, `answer`, `feedback` and `attemptsLabel` fields.
Add these fields beside them, above `setup()`:

```java
private final Question[] questions = {
        new Question("What is 2 + 3?", "5", "2 + 3 equals 5."),
        new Question("What is 9 % 4?", "1", "The remainder is 1."),
        new Question("Is 2 < 3? (true or false)", "true", "2 is less than 3.")
};
private int questionIndex = 0;
private int points = 0;
private boolean answered = false;
private boolean finished = false;
private Label questionLabel;
private Label scoreLabel;
private Button check;
private Button next;
private Button restart;
```

The array stores three ordinary Question objects. `questionIndex` selects one.
`points` stays in Main because Main owns the quiz rules. `answered` stops a
second point for the same question; `finished` stops checking after completion.

In `setup()`, change the old local `Label question` to the field:

```java
questionLabel = new Label();
```

Change the old local `Button check` to `check = new Button("Check");`.
Replace the old Reset button with two fields, and create a score label:

```java
next = new Button("Next");
restart = new Button("Restart");
scoreLabel = new Label();
```

Keep your `answer`, `feedback` and `attemptsLabel` creation lines. Replace
the old Reset action and layout with these lines. Put `showQuestion()` and
`refreshStats()` after `show(...)` so the existing controls are initialized:

```java
check.setOnAction(event -> checkAnswer());
next.setOnAction(event -> nextQuestion());
restart.setOnAction(event -> restartSession());
show(new VBox(10, questionLabel, answer, check, next, restart,
        feedback, attemptsLabel, scoreLabel));
showQuestion();
refreshStats();
```

There should be one `check.setOnAction(...)` line. Remove the old
`reset.setOnAction(...)` and old `show(...)` line.

## 3. Check once, then move forward

Replace the old `checkAnswer()` method with this version. It still counts each
try through your Counter from lesson 6:

```java
private void checkAnswer() {
    if (answered || finished) return;
    attempts.increment();
    if (questions[questionIndex].accepts(answer.getText())) {
        answered = true;
        points = points + 1;
        feedback.setText("Correct! " + questions[questionIndex].explanation());
        check.setDisable(true);
        next.setDisable(false);
    } else {
        feedback.setText("Try again.");
    }
    refreshStats();
}
```

Add these methods below it, still inside Main:

```java
private void nextQuestion() {
    if (!answered || finished) return;
    if (questionIndex == questions.length - 1) {
        finished = true;
        questionLabel.setText("Finished! Score: " + points + " / " + questions.length);
        answer.setDisable(true);
        check.setDisable(true);
        next.setDisable(true);
        feedback.setText("Choose Restart to try again.");
        return;
    }
    questionIndex = questionIndex + 1;
    answered = false;
    showQuestion();
}

private void showQuestion() {
    questionLabel.setText("Question " + (questionIndex + 1) + " of "
            + questions.length + ": " + questions[questionIndex].prompt());
    answer.clear();
    answer.setDisable(false);
    check.setDisable(false);
    next.setDisable(true);
    feedback.setText("");
}
```

At the last question, Next shows the completion message. At any new question,
`showQuestion()` clears the previous answer and keeps Next disabled until the
new answer is correct. The controls are reused; Main does not call `setup()`
again.

## 4. Restart and test the whole session

Replace the old `resetQuiz()` with `restartSession()` and add `refreshStats()`:

```java
private void restartSession() {
    questionIndex = 0;
    points = 0;
    answered = false;
    finished = false;
    attempts.reset();
    showQuestion();
    refreshStats();
}

private void refreshStats() {
    attemptsLabel.setText("Attempts: " + attempts.value());
    scoreLabel.setText("Score: " + points);
}
```

Try `4`, then `5`: feedback changes, Attempts is 2, Score is 1, and Check is
disabled. Click Next and answer `1`, then Next and answer ` TRUE `, then Next.
The end says **Finished! Score: 3 / 3**. Restart; expect question 1, empty
input, Attempts 0, Score 0 and disabled Next. After a correct
answer, try Check again: the button is disabled and the score stays at 1.

If you need to compare after making your edits, see the completed lesson 7
[Main](../../teaching/checkpoints/7/Main.java),
[Counter](../../teaching/checkpoints/7/Counter.java) and
[Question](../../teaching/checkpoints/7/Question.java). They are reference
checkpoints, not files you need to replace your project with.

**Challenge:** Add a fourth `Question` to the array, including its answer and
explanation. `questions.length` makes the labels and completion count adjust.

Next: [Start a movement game](08-movement.md).
