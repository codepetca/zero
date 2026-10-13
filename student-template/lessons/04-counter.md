# 4. Count clicks

**Make the number change.**

![Counter showing 2 above a +1 button](visuals/04.svg)

Target illustration: the counter after two clicks.

1. [Start this lesson in a fresh project](README.md#start-a-lesson).
2. Open the included [click-counter Main.java](../examples/click-counter/Main.java); **Run App**.
3. Click **+1** twice. Find the handler in the [code below](#code-and-explanation).

**Done:** The label goes **0 → 1 → 2**.

## Code and explanation

The fresh project already contains this `src/main/java/Main.java`, matching [click-counter Main](../examples/click-counter/Main.java):

```java
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    private int count = 0;

    public void setup() {
        var display = new Label("0");
        var add = new Button("+1");
        add.setOnAction(event -> {
            count = count + 1;
            display.setText("" + count);
        });
        var screen = new VBox(10, display, add);
        show(screen);
    }
    public static void main(String[] args) { launch(args); }
}
```

1. **Run App** → **0**
2. Click **+1** twice → **1**, **2**
3. Change `count + 1` to `count + 2`; rerun → **0**, **2**, **4**

`count` stores the number between clicks. `setText` updates the label.

Next: [Lesson 5](05-methods.md).
