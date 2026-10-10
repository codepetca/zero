# 3. A tiny quiz

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

Next: [Lesson 4](04-objects.md).
