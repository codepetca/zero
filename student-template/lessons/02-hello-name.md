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

### Layout and appearance

`Label`, `TextField` and `Button` are ordinary JavaFX controls. `VBox` arranges
them vertically; `HBox` arranges a row. Import layouts from
`javafx.scene.layout` and controls from `javafx.scene.control`. In
`new VBox(10, greeting, name, button)`, 10 is the gap between controls. Layouts
adapt to their text and available space without individual control coordinates.

For space around the whole interface, use `padding(20)` in Main's
`settings()` as in [lesson 0](00-hello-world.md#app-startup). It also works in
`setup()` or a JavaFX action; each call replaces the previous amount, and
`padding(0)` removes it. In App, padding uses some of the window's configured
size, so enlarge `size(...)` in settings if the content needs room.
An individual layout can instead use `setPadding(new Insets(20))`, importing
`javafx.geometry.Insets`. App padding and layout padding add together; choose
one place for the outer margin.

Try making the greeting larger. Add these imports:

```java
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
```

After creating `greeting` in setup, add:

```java
greeting.setFont(Font.font("System", FontWeight.BOLD, 24));
```

Use one font family and a few deliberate sizes. Keep clear button labels and
feedback near the action. Try Tab to reach the field and button, then Space
to activate the focused button. Keep the keyboard focus visible and use words
as well as colour to explain results. Later, `button.setDisable(true)` can
make an unavailable action explicit; `false` enables it again.

The controls work with their platform theme and need no stylesheet. Optional
external JavaFX CSS is a native-only extension beyond the supported browser
publishing profile. Normal **Run App** opens native JavaFX; publishing is a
separate action with its own compatibility checks. Keep the simple font change
for this learning path; a stylesheet can wait until your app needs more styling.

Next: [Start a tiny quiz](03-quiz.md).
