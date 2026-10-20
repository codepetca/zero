# 1. Say hello with a button

**Make a click change your greeting.**

![You did it! above a Say hello button](visuals/01.svg)

Target illustration: the label after clicking **Say hello**.

Open your **Greeting** project from lesson 0. Keep its `Main.java`.

## 1. Add the Button and VBox imports

In `Main.java`, add two imports beside the `Label` import:

```java
import javafx.scene.control.Button;
import javafx.scene.layout.VBox;
```

## 2. Create a button after the greeting in `setup()`

Keep your existing `greeting` line in `setup()`. After it, write:

```java
Button button = new Button("Say hello");
button.setOnAction(event -> greeting.setText("You did it!"));
```

## 3. Replace `show(greeting)` with a vertical layout

`VBox` stacks the label and button with 10 pixels between them. Replace only
`show(greeting);` with:

```java
show(new VBox(10, greeting, button));
```

The button's action changes the **existing** label. The label must stay in
`setup()` above the action so the action can use `greeting`.

## 4. Run App and click Say hello

Click **Run App**, then click **Say hello**. The label should change from **Hello, Java!** to **You did it!**. Try changing `You did it!` to your own short message and rerun. Keep this
Greeting project for lesson 2.

Next: [Greet by name](02-hello-name.md).
