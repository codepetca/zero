# 3. A tiny quiz

**Make an answer checker.**

![Question What is 2 + 3?, answer 5, Check button, Correct! feedback](visuals/03.svg)

Target illustration: a correct answer to your first quiz question.

1. [Start Study project](README.md#start-a-lesson) in a new **Study** project. Open its empty `setup()` in `Main.java`.
2. Write a question, answer field, Check button and feedback label. Add the check action.
3. Click **Run App**. Check `4`, then change it to `5` and check again.

**Done:** Feedback changes from **Try again.** to **Correct!**.

## Code and explanation

Keep the generated `Main extends App`, `setup()` and `main(...)` lines.
Add these imports above the class, beside the existing `zero.App` import:

```java
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
```

The button action will need the answer and feedback later. Add these fields
inside `Main`, **above** `setup()`:

```java
private TextField answer;
private Label feedback;
```

Add this method inside `Main`, above `setup()`, to leave space around the window edges:

```java
@Override public void settings() {
    padding(20);
}
```

`padding(20)` leaves 20 pixels on every edge. Keep this method as you grow the Study app.
The `10` in `new VBox(10, ...)` sets the gaps **between** controls.

Inside `setup()`, write the controls and put them in the window:

```java
Label question = new Label("What is 2 + 3?");
answer = new TextField();
Button check = new Button("Check");
feedback = new Label("");
show(new VBox(10, question, answer, check, feedback));
```

Before the `show(...)` line, give the button an action:

```java
check.setOnAction(event -> {
    if (answer.getText().equals("5")) {
        feedback.setText("Correct!");
    } else {
        feedback.setText("Try again.");
    }
});
```

The braces after `if` run when the typed text is exactly `5`; `else` handles
other text. Do not copy a new `Main.java` when you continue. You will grow this
same quiz through lesson 7. If you need to compare after trying it yourself,
see the [completed lesson 3 checkpoint](../../teaching/checkpoints/3/Main.java).

Next: [Count attempts](04-counter.md).
