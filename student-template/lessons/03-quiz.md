# 3. A tiny quiz

**Check one answer.**

![Question What is 2 + 3?, answer 5, Check button, Correct! feedback](visuals/03.svg)

Target illustration: a correct answer to the tiny quiz.

1. Follow the [safe switching steps](README.md#before-each-lesson).
2. Copy the [complete program below](#code-and-explanation) into `src/main/java/Main.java`; **Run App**.
3. Type `4` and click **Check**; change it to `5` and check again.

**Done:** Feedback changes from **Try again.** to **Correct!**.

## Code and explanation

Back up your work outside `src/`. Replace `src/main/java/Main.java`:

```java
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    public void setup() {
        var question = new Label("What is 2 + 3?");
        var answer = new TextField();
        var check = new Button("Check");
        var feedback = new Label("");
        check.setOnAction(event -> {
            if (answer.getText().equals("5")) {
                feedback.setText("Correct!");
            } else {
                feedback.setText("Try again.");
            }
        });
        var screen = new VBox(10, question, answer, check, feedback);
        show(screen);
    }
    public static void main(String[] args) { launch(args); }
}
```

1. **Run App**
2. Answer **2 + 3**
3. Click **Check** → **Correct!** or **Try again.**

Next: [Lesson 4](04-counter.md).
