# 2. Greet by name

**Let someone type the greeting.**

![Hello, Sam! above a Sam input and Say hello button](visuals/02.svg)

Target illustration: typing `Sam` and clicking **Say hello**.

1. Open the **same Greeting project** you changed in lessons 0 and 1.
2. Add a text field between the label and button. Change the button action to read it.
3. Click **Run App**, type `Sam`, and click **Say hello**.

**Done:** The label says **Hello, Sam!**. Another name gives another greeting.

## Code and explanation

Add this import beside your other JavaFX imports:

```java
import javafx.scene.control.TextField;
```

In `setup()`, after the `greeting` line and before the `button` line, write:

```java
TextField name = new TextField();
name.setPromptText("Your name");
```

Change the button's existing action to:

```java
button.setOnAction(event ->
        greeting.setText("Hello, " + name.getText() + "!"));
```

Replace the `show(...)` line so the field appears between the other controls:

```java
show(new VBox(10, greeting, name, button));
```

`name.getText()` reads what is in the field **when the button is clicked**.
Try your own name. You have now grown one project across three lessons. The
next lesson starts a new **Study** project, which you will keep through lesson 7.

Next: [Start a tiny quiz](03-quiz.md).
