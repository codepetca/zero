# 5. Add Reset with methods

Back up your work outside `src/`. Replace `src/main/java/Main.java` with
[reset-counter Main](../examples/reset-counter/Main.java):

```java
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    private int count = 0;
    private Label display;

    public void setup() {
        var countLabel = new Label("0");
        display = countLabel;
        var add = new Button("+1");
        var reset = new Button("Reset");
        add.setOnAction(event -> increment());
        reset.setOnAction(event -> reset());
        var screen = new VBox(10, display, add, reset);
        show(screen);
    }

    private void increment() {
        count = count + 1;
        display.setText("" + count);
    }

    private void reset() {
        count = 0;
        display.setText("" + count);
    }

    public static void main(String[] args) { launch(args); }
}
```

1. **Run App**; click **+1** twice → **2**
2. Click **Reset** → **0**; click **+1** → **1**
3. Find `increment()` and `reset()`: each changes the number and the label

The fields `count` and `display` are available to both methods.

Next: [Lesson 6](06-objects.md).
