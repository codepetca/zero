# 0. Hello, world!

Open `src/main/java/Main.java`. In an older kit, replace the quiz with this
program. This is the whole program:

```java
import javafx.scene.control.Label;
import zero.SimpleApp;

public class Main extends SimpleApp {
    public void setup() {
        var greeting = new Label("Hello, world!");
        show(greeting);
    }
    public static void main(String[] args) { launch(args); }
}
```

1. Click **Run App**. A separate window shows **Hello, world!**
2. Change `"Hello, world!"` to `"Hello, Java!"`.
3. Save, click **Stop**, then **Run App** again. The window shows your new greeting.

`greeting` names the label created by `new Label(...)`.
`show(greeting)` puts it in the window.
Keep the other lines as they are for now.

Next: [Lesson 1 — Say hello with a button](01-hello-button.md).
