# 1. Say hello with a button

Back up your work outside `src/`. Replace `src/main/java/Main.java`:

```java
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    public void setup() {
        var greeting = new Label("Hello, world!");
        var button = new Button("Say hello");
        button.setOnAction(event -> greeting.setText("Hello, Java!"));
        var screen = new VBox(10, greeting, button);
        show(screen);
    }
    public static void main(String[] args) { launch(args); }
}
```

1. **Run App**
2. Click **Say hello**
3. Change `"Hello, Java!"`
4. **Save → Stop → Run App**

Next: [Lesson 2](02-quiz.md).
