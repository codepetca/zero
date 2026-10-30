# 2. Say hello with a button

![You did it! above a Say hello button](visuals/01.svg)

Target illustration: the label after clicking **Say hello**.

Open your **Greeting** project from lesson 1. Keep its `Main.java`.

## 1. Add the imports after `import zero.ui.Label;`

Add the `Button` and `Column` imports in `Main.java`; replace the matching lines with the copied code:

```java-after-2-3
import zero.ui.Label;
import zero.ui.Button;
import zero.ui.Column;
```

## 2. Create a button after the greeting in `setup()`

In `setup()`, add the button and its action by replacing the matching lines with the copied code. Keep your own greeting text if you changed it:

```java-after-2-3
        Label greeting = new Label("Hello, Java!");
        Button button = new Button("Say hello");
        button.onClick(() -> greeting.setText("You did it!"));
        show(greeting);
```

## 3. Replace `show(greeting)` with a vertical layout

`Column` stacks the label and button with 10 pixels between them. Copy the block over the matching lines in `setup()`:

```java-after-3-r2
        button.onClick(() -> greeting.setText("You did it!"));
        show(greeting);
        show(new Column(10, greeting, button));
```

`onClick` tells Zero which code to run when the button is activated.
The `() ->` introduces that action; you do not need an event object.
The button's action changes the **existing** label. The label must stay in
`setup()` above the action so the action can use `greeting`.

## 4. Run App and click Say hello

Click **Run App**, then click **Say hello**. The label should change from **Hello, Java!** to **You did it!**. Try changing `You did it!` to your own short message and rerun. Keep this
Greeting project for lesson 3.

Next: [Greet by name](02-hello-name.md).
