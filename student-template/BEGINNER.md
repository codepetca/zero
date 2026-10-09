# Start small

Zero helps you make Java apps and games. Start with one of the two tracks below.
Use ordinary Java fields, methods and objects to hold your app's state.
You can learn more JavaFX when your project needs it.

The starter opens with a small quiz. Keep it while you learn, or follow an
example's copy instructions to replace it in a separate starter folder.
Examples are outside `src/` until you copy them.
If an older downloaded kit does not include these examples, the website's
example pages show the complete files to copy into the same starter destinations.

## Apps: controls that respond to events

Choose `SimpleApp` for a quiz, calculator, study tool or small form. Start with
the complete [Hello app](examples/hello-app/README.md), including its stylesheet.

```text
launch → settings() → setup() → show the window
                                    ↓
                         respond to user events
```

Override `settings()` once to call `size(width, height)` and `title("My app")`.
Override `setup()` once to create controls, connect handlers and call
`show(screen)`. Keep the example's `main` method to launch the app.
There is no automatic `update()` or `draw()` callback in SimpleApp.

Start with these ordinary JavaFX classes:

| Class | Use | First methods to learn |
| --- | --- | --- |
| `Label` | Show instructions or feedback | `setText("Hello")` |
| `Button` | Let the user choose an action | `setOnAction(event -> { ... })`, `setText("Play")` |
| `TextField` | Read a short answer | `getText()`, `setText("")`, `setPromptText("Your name")` |
| `VBox` | Arrange controls vertically | `new VBox(16, heading, instructions, name, actions, feedback)` |
| `HBox` | Arrange controls horizontally | `new HBox(12, hello, reset)` |

Import controls from `javafx.scene.control` and layouts from
`javafx.scene.layout`. A box constructor's first number is the spacing between
its children. You can also call `setSpacing(12)` later.
Use `setPadding(new Insets(24))` for space inside the edge of a box, and
`setAlignment(Pos.CENTER_LEFT)` to align its children. Import `Insets` and
`Pos` from `javafx.geometry`.

An event handler runs when the user takes an action:

```java
hello.setOnAction(event -> {
    String enteredName = name.getText().trim();
    if (enteredName.isEmpty()) {
        feedback.setText("Type your name first.");
    } else {
        feedback.setText("Hello, " + enteredName + "!");
    }
});
```

`name`, `hello` and `feedback` are the controls created in setup. JavaFX redraws
them after their values change. If an action should become unavailable, use
`hello.setDisable(true)`; use `false` to enable it again. Hello app puts the
greeting logic in `greet()` and calls that ordinary method from its handlers.

Try three changes in Hello app: change the greeting, change the main button
colour, then change the VBox spacing. Use the [appearance guide](STYLE.md) to
change its colours and spacing.

## Games: update the state, then draw it

Choose `SketchApp` for a drawing, moving objects or a small game. Start with
the complete [Reach the coin game](examples/reach-the-coin/README.md).

```text
launch → settings() → create canvas → setup() → show the window
                                                    ↓
                                  update(seconds) → draw()
                                         ↑             │
                                         └─────────────┘
```

Use `settings()` for `size(...)` and `title(...)`, and `setup()` to create your
objects. Each frame, `update(seconds)` changes positions and checks the rules;
`draw()` displays the current state. Zero calls these methods on Main.

Start with this small drawing and input set:

| Method | Use |
| --- | --- |
| `background(Color.WHITE)` | Clear the canvas for a fresh frame |
| `fill(Color.BLUE)` | Choose the colour for filled shapes and text |
| `rect(x, y, width, height)` | Draw a filled rectangle |
| `circle(centreX, centreY, diameter)` | Draw a filled circle |
| `textSize(20)` | Choose the default font at this size |
| `text("Hello", x, y)` | Draw text; y is its baseline |
| `keyDown(KeyCode.RIGHT)` | Check whether a key is held |
| `mouseX()`, `mouseY()` | Read the tracked canvas pointer position |
| `mouseDown(MouseButton.PRIMARY)` | Check whether the mouse button is held |
| `width()`, `height()` | Read the canvas dimensions |

Import `Color` from `javafx.scene.paint`, and `KeyCode` and `MouseButton` from
`javafx.scene.input`. Canvas coordinates start at `(0, 0)` in the top left;
x increases to the right and y increases downward.

Click the canvas before using game keys. Returning from another window may
require another click. Typing in a text control belongs to that control.
Input methods report held state, so holding R in Reach the coin keeps resetting
until you release it.

Move using elapsed time rather than a fixed distance per frame:

```java
if (keyDown(KeyCode.RIGHT)) {
    x += 180 * seconds; // 180 pixels per second
}
```

Frame rate can vary. The first frame receives `0` seconds and later elapsed
values are capped at `0.1` seconds. The canvas has the fixed pixel dimensions
chosen in settings; resizing the window does not scale the drawing.

Your objects are ordinary Java objects. Main must call their methods explicitly:

```java
// Inside Main.update:
player.update(horizontal, vertical, seconds, width(), height());

// Inside Main.draw, after drawing the background and coin:
player.draw(this);
```

Zero never discovers Player or updates it automatically. In Reach the coin,
Main owns the win flag and Player owns its position and movement methods.
Follow the game's two tiny changes, then try changing its colours.

## When you want more

Keep event handlers and frame methods short: they share the JavaFX UI thread.
Let callbacks return so JavaFX can handle input and display the next frame.

The [appearance guide](STYLE.md) introduces fonts, stylesheets and images.
The [full Zero API reference](API.md) covers outlines, lines, images and native
JavaFX access through `graphics()`, `canvas()` and `layout()`. These are available
when your project needs them. Wider JavaFX controls and layouts remain ordinary
JavaFX APIs; learning them does not require a new Zero engine or object model.
