# Zero app API

New to Zero? Start with the [beginner toolkit](BEGINNER.md), then
[make it look good](STYLE.md). This page is the complete reference; you can
learn a small set first:

| Build | Start with |
| --- | --- |
| An app | `SimpleApp`: `settings()`, `setup()`, `size(...)`, `title(...)`, `show(...)`; ordinary `Label`, `Button`, `TextField`, `VBox`, `HBox`. |
| A game | `SketchApp`: the same startup, plus `update(seconds)`, `draw()`, `keyDown(...)`, `width()`, `height()`, `background(...)`, `fill(...)`, `rect(...)`, `circle(...)`, `textSize(...)`, `text(...)`. |
| Improve appearance | JavaFX fonts, a few colours, spacing/padding and an editable stylesheet; canvas fonts through `graphics().setFont(...)`. |

Try [Hello, Java](examples/hello-app/README.md) for a complete styled app or
[Reach the coin](examples/reach-the-coin/README.md) for a two-file game. Both use
the pinned starter without additional dependencies or Zero APIs.

This reference describes the bundled [SimpleApp source](src/main/java/zero/SimpleApp.java)
and [SketchApp source](src/main/java/zero/SketchApp.java). Use these classes for
startup, drawing and input; use ordinary Java for your app's objects and rules.
The source is the authority if you change your local framework.

## Choose an app

Extend `zero.SimpleApp` for buttons, forms, quizzes and other event-driven
interfaces. Extend `zero.SketchApp` for a canvas that updates and draws each frame.
Both are JavaFX applications. Put this entry point in your Main class:

```java
public static void main(String[] args) { launch(args); }
```

`launch` comes from JavaFX `Application`. Normal Run App uses `Main`, as configured
by `app.mainClass` in [pom.xml](pom.xml). See [README.md](README.md) for running
and [EXERCISES.md](EXERCISES.md) for practice.

## SimpleApp: startup and interfaces

Override these public methods; their default bodies do nothing:

| Signature | When it runs / what to put here |
| --- | --- |
| `void settings()` | Once at startup, before the interface exists. Set the initial size and title. |
| `void setup()` | Once after the root exists, before the window is shown. Build your controls and show them. |

These public methods are `final` (call them; do not override them):

| Signature | Behavior |
| --- | --- |
| `void size(double width, double height)` | Set initial content dimensions in pixels, inside `settings()` only. Both numbers must be positive and finite. Default: 800 × 500. |
| `void title(String title)` | Set the window title inside `settings()` only. It must not be null. Default: `"Zero"`. |
| `void show(Node content)` | Replace the root's centre with a non-null JavaFX node. Call in `setup()` or later in an event handler. |

`size` and `title` throw `IllegalStateException` outside settings; invalid size
throws `IllegalArgumentException`. `show` before startup throws
`IllegalStateException`; null title/content is rejected. These methods do not
resize or retitle an already-open window.

```java
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    private int clicks;

    @Override public void settings() {
        title("Click counter");
        size(360, 220);
    }

    @Override public void setup() {
        Label total = new Label("Clicks: 0");
        Button add = new Button("Add one");
        add.setOnAction(event -> {
            clicks++;
            total.setText("Clicks: " + clicks);
        });
        show(new VBox(12, total, add));
    }

    public static void main(String[] args) { launch(args); }
}
```

SimpleApp has no animation loop. The window is resizable; native layouts arrange
their children. `show` replaces content; it does not store screens or create a
navigation history. Keep any state you need in your own fields and objects.

## Ordinary JavaFX and reusable objects

Useful native starting points include `Label.setText(String)`,
`Button.setOnAction(...)`, `TextField.getText()` and `setPromptText(String)`,
`Node.setDisable(boolean)`, and `VBox`, `HBox` and `BorderPane` layouts.
For example, `new VBox(12, firstNode, secondNode)` uses 12-pixel spacing;
`screen.setPadding(new Insets(20))` uses 20-pixel padding. Import controls from
`javafx.scene.control`, layouts from `javafx.scene.layout`, and `Insets` from
`javafx.geometry`. These are JavaFX APIs, not extra Zero methods.

A component can be an ordinary class with a method such as `Node view()` that
returns its UI. `view()` is a convention you choose, not a framework callback.
No component base class, registration, or automatic object discovery is required.
Create separate instances when showing the component in separate parents:
a JavaFX node can belong to only one parent.

The bundled [ScoreDisplay](examples/shared/ScoreDisplay.java) is an example class:
`ScoreDisplay()` uses the caption `"Score"`, `ScoreDisplay(String caption)`
customizes it, `void setScore(int points)` updates the label, and `Node view()`
returns it. Main owns the number and scoring rules. For example, after changing
`points`, call `score.setScore(points)` yourself.

[Player](examples/animation/Player.java) and
[Question](examples/study/Question.java) are also ordinary example classes.
Their methods belong to those examples; they are not core Zero APIs or required
names. The study app's Question holds data and checks an answer; Main decides
when to advance and award points.

## SketchApp: frames and canvas

SketchApp inherits settings, setup, size and title. It creates its canvas before
setup, shows the window, then starts frames. Override:

| Signature | Behavior |
| --- | --- |
| `void update(double seconds)` | Called each frame before draw. Change your state and explicitly update your objects. |
| `void draw()` | Called after update. Draw the current state. |

The first frame receives `seconds == 0`. Later values measure elapsed time in
seconds and are capped at `0.1` after a long pause. Frames are not promised at a
fixed rate. For speed measured in pixels per second, use `x += speed * seconds`.
The canvas is not cleared automatically; draw a background when you want a fresh
frame. Drawing styles persist until you change them.

`size` sets fixed canvas dimensions, not a scaling rule. Resizing the window
does not stretch the canvas pixels. Extra native controls can make the initial
window larger than the canvas. Call the following public final methods in setup
or later, after the canvas exists:

| Signature | Result |
| --- | --- |
| `double width()` | Current canvas width. |
| `double height()` | Current canvas height. |
| `Canvas canvas()` | The native JavaFX canvas. |
| `GraphicsContext graphics()` | Its native drawing context. |
| `BorderPane layout()` | The layout containing the canvas in its centre. |

Use `layout().setBottom(button)` or other BorderPane positions for native controls
around the canvas. Keep its centre canvas for a sketch. Use SimpleApp and
`show(Node)` for a wholly event-driven interface; inherited `show` on a sketch
replaces the visible sketch layout but does not stop its frame loop.

### Drawing methods

Every signature below is public and final. Coordinates use canvas pixels,
with `(0, 0)` at the top left and y increasing downward. Import `Color` from
`javafx.scene.paint`.

| Signature | Behavior |
| --- | --- |
| `void background(Color color)` | Clear and fill the full canvas, preserving drawing styles. Uses an identity transform while clearing/filling, then restores the context. |
| `void fill(Color color)` | Set the fill used by filled shapes and text. |
| `void stroke(Color color)` | Set the stroke used by lines and outlines. |
| `void strokeWidth(double pixels)` | Set line width. |
| `void textSize(double pixels)` | Set a default JavaFX font at this size. |
| `void rect(double x, double y, double width, double height)` | Filled rectangle; x/y are its top-left corner. |
| `void outlineRect(double x, double y, double width, double height)` | Stroked rectangle; x/y are its top-left corner. |
| `void circle(double centreX, double centreY, double diameter)` | Filled circle centred at x/y; the last value is diameter, not radius. |
| `void line(double x1, double y1, double x2, double y2)` | Stroked line between two points. |
| `void text(String value, double x, double y)` | Filled text. By default y is the text baseline, not its top edge. |
| `void image(Image image, double x, double y)` | Draw an image at x/y using its natural size. |
| `void image(Image image, double x, double y, double width, double height)` | Draw an image scaled to the supplied dimensions. |
| `Image loadImage(String resourcePath)` | Load a bundled resource; throw `IllegalArgumentException` if missing or unreadable. |

The helpers use the native GraphicsContext, including settings you change through
`graphics()`. For transformations or other native drawing, you can use
`graphics().save()` and `graphics().restore()` around your changes.

### Images and resources

Place `player.png` in `src/main/resources/`. Import `javafx.scene.image.Image`,
keep an Image field, and load it once in setup:

```java
sprite = loadImage("/player.png");
```

Then call `image(sprite, x, y)` in draw. The leading `/` starts at the classpath
resource root. A path without `/` is relative to your class's Java package.
`loadImage` performs a load each time you call it; it does not maintain a cache.
Avoid repeated loading inside draw.

### Input methods

Import `KeyCode` and `MouseButton` from `javafx.scene.input`. These public final
methods report held state, not a one-time click or keypress callback:

| Signature | Result |
| --- | --- |
| `double mouseX()` | Latest tracked mouse x in canvas coordinates. Starts at canvas centre. |
| `double mouseY()` | Latest tracked mouse y in canvas coordinates. Starts at canvas centre. |
| `boolean keyDown(KeyCode key)` | Whether a key pressed while the canvas had focus is held. |
| `boolean mouseDown(MouseButton button)` | Whether a button pressed on the canvas is held. |

Click the canvas to give it focus. Native text controls receive ordinary typing;
their presses do not become game input. Losing canvas or window focus clears
held keys/buttons. Releasing an owned key/button clears it, including a mouse
release outside the canvas. Mouse coordinates track canvas events and an owned
drag, and can be outside its bounds; they do not continually track movement over
other controls.

This small sketch makes movement explicit:

```java
import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import zero.SketchApp;

public class Main extends SketchApp {
    private double x = 60;

    @Override public void settings() { size(400, 240); title("Move right"); }
    @Override public void update(double seconds) {
        if (keyDown(KeyCode.RIGHT)) x = Math.min(width() - 20, x + 120 * seconds);
    }
    @Override public void draw() {
        background(Color.WHITE);
        fill(Color.BLUE);
        circle(x, height() / 2, 40);
    }
    public static void main(String[] args) { launch(args); }
}
```

For an object-based version, see [animation Main](examples/animation/Main.java):
Main calls `player.update(mouseX(), mouseY(), seconds)` and `player.draw(this)`.
Zero never calls a Player's methods automatically.

## Threading, errors and advanced Java

Settings, setup, frames and JavaFX event handlers run on the JavaFX application
thread. Keep them short. Sleeping, long calculations or blocking file/network
work freezes the UI. Native background-work tools such as JavaFX Task are an
advanced option; update live controls on the JavaFX application thread.

A startup failure closes the window and runs shutdown; a failed sketch frame
stops its timer and clears held input, then reports the exception. Closing an app
also stops the sketch timer. Fix the source and Run App again.

For framework contributors, SimpleApp exposes protected hooks:
`final double initialWidth()`, `final double initialHeight()`,
`Node createContent()`, `Scene createScene(BorderPane content)`,
`void ready(Stage stage)` and `void shutdown()`. Startup runs settings, creates
the root/content, runs setup, creates the scene, shows the stage, then calls
ready. Its public `final void start(Stage stage)` and `final void stop()` manage
that lifecycle; stop calls shutdown. SketchApp provides final overrides of the
content/scene/ready/shutdown hooks to own its canvas and timer. Students normally
override only settings, setup, update and draw.

Java packages, interfaces, collections and JavaFX properties remain available.
For a packaged class `school.app.Main`, use `package school.app;`, place it in
`src/main/java/school/app/Main.java`, and change `app.mainClass` in pom.xml to
`school.app.Main`. A packaged Main cannot import helpers from Java's unnamed
package; move its helpers into named packages too. Resource-root image paths
such as `/player.png` keep working.

The starter includes JavaFX controls (and its graphics dependencies). Persistence,
media, FXML and web features are separate app/dependency work, not bundled Zero
helpers. Versioned community components and a workshop are being developed
separately; they do not change this core API or require a component base class.
