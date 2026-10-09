# 1. Change the quiz

Your goal is to change a question and explain how a button changes program state.

## Open and predict

Use the default quiz, or copy [quiz Main](../examples/quiz/Main.java) and the
[shared ScoreDisplay](../examples/shared/ScoreDisplay.java) using the
[switching steps](README.md#before-each-lesson).

Before running, predict the feedback and score after entering `41`, then ` 42 `,
then trying to click Check answer again. Run and compare your prediction.
The original question awards 10 points once; the button becomes disabled after
a correct answer. A wrong answer lets you try again.

## Read the code

Find `points`, `answer`, `feedback`, `check` and `score`. Which hold values and
which refer to objects? Find where `setup()` creates the controls and where
`checkAnswer()` changes them.

```java
check.setOnAction(event -> checkAnswer());
```

Read this as “when this button is clicked, call checkAnswer.” You can use this
line without learning all lambda syntax today. `setup()` builds the interface
once; `SimpleApp` has no repeated `draw()` loop. Main owns the score; calling
`score.setScore(points)` updates the displayed number.

## Make three small changes

1. Change the question to “What is 8 + 5?” and the expected answer to `"13"`.
   Keep the answer in quotes because a TextField supplies text.
2. Award 5 points instead of 10. Keep the correct-answer button lock.
3. Replace “Try again.” with helpful feedback that does not reveal the answer.
   Then change either the window title or the VBox spacing.

Save, Stop and Run App after each change. As a debugging exercise, remove the
semicolon from `points += 5;`, try Run App, use Problems to find the source line,
then restore the semicolon and rerun. The compiler location can point just after
the actual mistake. Keep the repaired program.

## Check your version

| Action | Expected result |
| --- | --- |
| Enter a blank answer or `12` | Your feedback appears; score stays 0; retry remains available |
| Enter ` 13 ` | Correct feedback; score becomes 5; Check answer is disabled |
| Try to check again after success | Score stays 5 |
| Stop and run again | Score begins at 0 and checking is enabled |

`trim()` removes surrounding spaces; `equals("13")` compares string content.
Do not replace it with `==` for this text comparison.

## Explain before moving on

Show your working question. Explain which method runs at startup, which runs
after a click, and why the score is not awarded twice. Include your repaired
compile error and two actual check results in your lesson record.

Optional: add a hint Label to the VBox in `setup()`. It should help someone think,
and the scoring and retry rules should still pass the checks above.
