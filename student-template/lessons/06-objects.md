# 6. Use an ordinary object

**Let Counter own the number.**

![Counter showing 0 above +1 and Reset buttons, with a separate Counter object](visuals/06.svg)

Target illustration: the same controls, now using a Counter object.

1. Follow the [safe switching steps](README.md#before-each-lesson).
2. Copy [Main.java](../examples/object-counter/Main.java) and [Counter.java](../examples/object-counter/Counter.java) into `src/main/java/`; **Run App**.
3. Click **+1** twice, **Reset**, then **+1**. Find `counter.increment()` in the [code below](#code-and-explanation).

**Done:** The label goes **2 → 0 → 1** with Main calling Counter.

## Code and explanation

Back up your work outside `src/`. Replace `src/main/java/Main.java` with
[object-counter Main](../examples/object-counter/Main.java):

```java
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    private final Counter counter = new Counter();

    public void setup() {
        var display = new Label("" + counter.value());
        var add = new Button("+1");
        var reset = new Button("Reset");
        add.setOnAction(event -> {
            counter.increment();
            display.setText("" + counter.value());
        });
        reset.setOnAction(event -> {
            counter.reset();
            display.setText("" + counter.value());
        });
        var screen = new VBox(10, display, add, reset);
        show(screen);
    }
    public static void main(String[] args) { launch(args); }
}
```

Create `src/main/java/Counter.java` from
[Counter](../examples/object-counter/Counter.java):

```java
public class Counter {
    private int count = 0;

    public void increment() {
        count = count + 1;
    }

    public void reset() {
        count = 0;
    }

    public int value() {
        return count;
    }
}
```

1. **Run App**; click **+1** twice → **2**
2. Click **Reset** → **0**; click **+1** → **1**
3. Find `counter.increment()`, `counter.reset()` and `counter.value()` in Main

Counter owns the number. Main calls its methods and updates the label.
Counter is an ordinary Java class; it needs no registration.

Next: [Lesson 7](07-study-app.md).
