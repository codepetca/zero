# 0. Hello, world!

Open `src/main/java/Main.java`. In an older kit, replace the quiz with this
program. This is the whole program:

```java
import javafx.scene.control.Label;
import zero.SimpleApp;

public class Main extends SimpleApp {
    public void setup() {
        show(new Label("Hello, world!"));
    }
    public static void main(String[] args) { launch(args); }
}
```

1. Click **Run App**. A separate window shows **Hello, world!**
2. Change `"Hello, world!"` to `"Hello, Java!"`.
3. Save, click **Stop**, then **Run App** again. The window shows your new greeting.

`new Label(...)` creates the text. `show(...)` puts it in the window.
Keep the other lines as they are for now.

Next: [Lesson 1 — Change the quiz](01-quiz.md).
