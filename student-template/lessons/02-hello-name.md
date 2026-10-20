# 2. Greet by name

**Let someone type the greeting.**

![Hello, Sam! above a Sam input and Say hello button](visuals/02.svg)

Target illustration: typing `Sam` and clicking **Say hello**.

Open the **same Greeting project** you changed in lessons 0 and 1.

## 1. Add this import beside your other JavaFX imports

Add this import beside your other JavaFX imports:

```java
import javafx.scene.control.TextField;
```

## 2. Create a text field before the button in `setup()`

In `setup()`, after the `greeting` line and before the `button` line, write:

```java
TextField name = new TextField();
name.setPromptText("Your name");
```

## 3. Change the button action to read the name

Change the button's existing action to:

```java
button.setOnAction(event ->
        greeting.setText("Hello, " + name.getText() + "!"));
```

## 4. Put the field between the label and button

Replace the `show(...)` line so the field appears between the other controls:

```java
show(new VBox(10, greeting, name, button));
```

## 5. Run App and try two names

`name.getText()` reads what is in the field **when the button is clicked**.
Click **Run App**, type `Sam`, then click **Say hello**. The label should say **Hello, Sam!**. Try your own name and check that the greeting changes. You have now grown one project across three lessons. The
next lesson starts a new **Study** project, which you will keep through lesson 7.

Next: [Start a tiny quiz](03-quiz.md).
