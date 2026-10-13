# 2. Greet by name

**Type a name, then greet it.**

![Hello, Sam! above a Sam input and Say hello button](visuals/02.svg)

Target illustration: typing Sam and clicking Say hello.

1. [Start this lesson in a fresh project](README.md#start-a-lesson).
2. Open the [complete program below](#code-and-explanation) in `src/main/java/Main.java`; **Run App**.
3. Type `Sam`; click **Say hello**. Try your own name next.

**Done:** The label says **Hello, Sam!**, then changes for your next name.

## Code and explanation

The fresh project already contains this `src/main/java/Main.java`:

```java
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    public void setup() {
        var greeting = new Label("Hello, world!");
        var name = new TextField();
        name.setPromptText("Your name");
        var button = new Button("Say hello");
        button.setOnAction(event -> greeting.setText("Hello, " + name.getText() + "!"));
        var screen = new VBox(10, greeting, name, button);
        show(screen);
    }
    public static void main(String[] args) { launch(args); }
}
```

1. **Run App**
2. Type your name
3. Click **Say hello**

Next: [Lesson 3](03-quiz.md).
