# 0. Hello, world!

**A greeting you can change.**

![Hello, Java! after saving and rerunning](visuals/00.svg)

Target illustration: the greeting after your edit.

1. Use the [safe switching steps](README.md#before-each-lesson), then open `src/main/java/Main.java`.
2. Keep or copy the [complete program below](#code-and-explanation); click **Run App**.
3. Change `Hello, world!` to `Hello, Java!`; **Save → Stop → Run App**.

**Done:** The new window says **Hello, Java!**.

## Code and explanation

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
