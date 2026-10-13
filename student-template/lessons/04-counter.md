# 4. Count quiz attempts

**Count every press of Check.**

![Quiz with Attempts: 2 after two checks](visuals/04.svg)

Target illustration: the same quiz after two checks.

1. Open your **Study** project from lesson 3. Keep its question and Check action.
2. Add an `attempts` field and a label for it, then update both on each check.
3. Click **Run App** and check twice, using any answers.

**Done:** The quiz shows **Attempts: 2** after two checks. Its answer feedback still works.

## Code and explanation

In `Main`, above `setup()` and beside your `answer` and `feedback` fields, add:

```java
private int attempts = 0;
private Label attemptsLabel;
```

In `setup()`, after `feedback = new Label("");`, create the new label:

```java
attemptsLabel = new Label("Attempts: 0");
```

Add `attemptsLabel` as the **last** item in the existing `VBox`:

```java
show(new VBox(10, question, answer, check, feedback, attemptsLabel));
```

Inside the **existing** `check.setOnAction(...)` block, put these two lines
*before* the `if` statement:

```java
attempts = attempts + 1;
attemptsLabel.setText("Attempts: " + attempts);
```

`attempts` is a field because its value must survive from one click to the
next. The label shows the current value; changing the number alone does not
change the screen. Keep checking answers: two wrong attempts still show
**Try again.**, and a correct answer still shows **Correct!**.

If you need to compare your result, see the [completed lesson 4 checkpoint](../../teaching/checkpoints/4/Main.java).

Next: [Add Reset with methods](05-methods.md).
