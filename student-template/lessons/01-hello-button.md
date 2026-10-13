# 1. Say hello with a button

**Make one click change a label.**

![Hello, Java! above a Say hello button](visuals/01.svg)

Target illustration: the label after clicking Say hello.

1. [Start this lesson in a fresh project](README.md#start-a-lesson).
2. Open the [complete program below](#code-and-explanation) in `src/main/java/Main.java`; **Run App**.
3. Click **Say hello**, then change the handler's greeting and **Run App**.

**Done:** Clicking **Say hello** shows your changed greeting.

## Code and explanation

The fresh project already contains this `src/main/java/Main.java`:

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
4. **Run App**

Next: [Lesson 2](02-hello-name.md).
