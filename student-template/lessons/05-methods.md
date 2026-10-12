# 5. Add Reset with methods

**Return the counter to zero.**

![Counter showing 0 above +1 and Reset buttons](visuals/05.svg)

Target illustration: the counter after Reset.

1. Follow the [safe switching steps](README.md#before-each-lesson).
2. Copy [reset-counter Main.java](../examples/reset-counter/Main.java) into `src/main/java/Main.java`; **Run App**.
3. Click **+1** twice, **Reset**, then **+1**. Find the two methods in the [code below](#code-and-explanation).

**Done:** The label goes **2 → 0 → 1**.

## Code and explanation

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
