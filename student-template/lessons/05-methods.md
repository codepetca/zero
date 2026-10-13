# 5. Add Reset with methods

**Give your quiz a fresh start.**

![Quiz with Reset button and Attempts: 0](visuals/05.svg)

Target illustration: your quiz just after clicking **Reset**.

1. Open the **same Study project** from lesson 4.
2. Move the check code into `checkAnswer()`. Add `resetQuiz()` and a Reset button.
3. Click **Run App**; check twice, click **Reset**, then check once more.

**Done:** The label goes **Attempts: 2 → 0 → 1**. Reset clears the answer and feedback.

## Code and explanation

The answer, feedback and attempts labels are already fields, so your new
methods can use them. In `setup()`, create a button beside `check`:

```java
Button reset = new Button("Reset");
```

Replace the old `check.setOnAction(...)` block with two short actions:

```java
check.setOnAction(event -> checkAnswer());
reset.setOnAction(event -> resetQuiz());
```

Put `reset` after `check` in the existing `VBox`:

```java
show(new VBox(10, question, answer, check, reset, feedback, attemptsLabel));
```

Below `setup()` but **inside** `Main`, write a named method with the code you
removed from the old Check action:

```java
private void checkAnswer() {
    attempts = attempts + 1;
    attemptsLabel.setText("Attempts: " + attempts);
    if (answer.getText().equals("5")) {
        feedback.setText("Correct!");
    } else {
        feedback.setText("Try again.");
    }
}
```

Add a second method beside it:

```java
private void resetQuiz() {
    attempts = 0;
    attemptsLabel.setText("Attempts: 0");
    answer.clear();
    feedback.setText("");
}
```

Do not leave the old check block in `setup()`; there should be one Check
handler. `checkAnswer()` and `resetQuiz()` name the two actions, and both
change the state and the visible controls. For comparison after building,
see the [completed lesson 5 checkpoint](../../teaching/checkpoints/5/Main.java).

Next: [Make a Counter object](06-objects.md).
