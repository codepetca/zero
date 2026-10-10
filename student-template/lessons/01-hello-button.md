# 1. Say hello with a button

Keep your greeting from [Lesson 0](00-hello-world.md) outside `src/` if you want
to save it. Replace `src/main/java/Main.java` with this program, or copy
[the button example](../examples/hello-button/Main.java) over that file:

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

1. Click **Run App**. The label says **Hello, world!**
2. Click **Say hello**. The same label changes to **Hello, Java!**
3. Change `"Hello, Java!"` in the click line to your own greeting. Save, **Stop**
   and **Run App** again, then click the button to see your message.

`greeting` names the label. `button` names the button.
`new VBox(10, greeting, button)` stacks them with a small gap.

Read `button.setOnAction(event -> ...)` as **when this button is clicked, do this**.
`greeting.setText(...)` changes the label's text. Keep the `event ->` pattern
as it is for now.

Check: before clicking, the original greeting appears. After clicking, your
new greeting appears. A second click keeps that greeting.

Next: [Lesson 2 — Change the quiz](02-quiz.md).
