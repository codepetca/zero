# Zero API reference

The complete API declared by `zero.SimpleApp` and `zero.GameApp`.
For setup, explanations and complete examples, see the [app guide](APP-GUIDE.md)
or [starter guide](README.md).

[SimpleApp](#simpleapp) · [GameApp](#gameapp) ·
[Canvas](#canvas) · [Drawing](#drawing) · [Images](#images) ·
[Input](#input) · [Lifecycle and extension hooks](#lifecycle-and-extension-hooks)

## SimpleApp

`public abstract class SimpleApp extends javafx.application.Application`

Extend `zero.SimpleApp` for event-driven interfaces. It has an implicit public
no-argument constructor. The default window is resizable, 800 × 500 pixels,
with title `"Zero"` and zero content-edge padding. Import JavaFX `Node` from `javafx.scene`.

### Callbacks

Override these public methods. Their default bodies do nothing.

| Signature | Behavior |
| --- | --- |
| `void settings()` | Runs once before content creation. Configure the initial window here. |
| `void setup()` | Runs once after content creation, before the window is shown. Create controls and call `show` here. |

### Window and content

These methods are public and final; call them without overriding them.

| Signature | Behavior |
| --- | --- |
| `void size(double width, double height)` | Set initial content dimensions in pixels, inside `settings()` only. Dimensions must be positive and finite. On GameApp, these are fixed canvas dimensions. |
| `void title(String title)` | Set a non-null initial window title, inside `settings()` only. |
| `void padding(double pixels)` | Set equal space around every content edge, inside `settings()` only. The number must be non-negative and finite. Default: 0. Space is inside the window dimensions; a game keeps its fixed canvas size. |
| `void show(Node content)` | Replace the root's centre with a non-null JavaFX node, in `setup()` or later. No screen history is stored. On GameApp this replaces the visible game layout while its loop continues. |

`size`, `title` and `padding` throw `IllegalStateException` outside `settings()`;
invalid dimensions or padding throw `IllegalArgumentException`. `show` throws `IllegalStateException`
before content creation. Null title/content throws `NullPointerException`.
`size`, `title` and `padding` do not change an already-open window.

## GameApp

`public abstract class GameApp extends SimpleApp`

Extend `zero.GameApp` for games, animation and canvas input. It has an implicit public
no-argument constructor and inherits all SimpleApp public methods above.
Its canvas exists before `setup()`. It starts frames after showing the window.

| Public callback | Behavior |
| --- | --- |
| `void update(double seconds)` | Runs each frame before `draw()`. Update your state and objects explicitly. Default: no action. |
| `void draw()` | Runs after `update()`. Draw the current state. Default: no action. |

The first frame receives `0` seconds; later elapsed times are capped at `0.1`.
Frame rate is variable. The canvas is not automatically cleared; drawing styles
persist. Resizing the window does not scale its fixed canvas. Native controls
around the canvas can enlarge the initial window.

## Canvas

These GameApp methods are public and final. Call them in `setup()` or later,
after canvas creation. Imports: `javafx.scene.canvas.Canvas`,
`javafx.scene.canvas.GraphicsContext`, `javafx.scene.layout.BorderPane`.

| Signature | Result |
| --- | --- |
| `double width()` | Canvas width in pixels. |
| `double height()` | Canvas height in pixels. |
| `Canvas canvas()` | Native JavaFX canvas. |
| `GraphicsContext graphics()` | Native drawing context, including transforms and styles. |
| `BorderPane layout()` | Layout with the canvas in its centre. Add native controls to its other positions. |

## Drawing

These GameApp methods are public and final. Call them after canvas creation.
Coordinates use canvas pixels: `(0, 0)` is the top left; y increases downward.
Import `Color` from `javafx.scene.paint`.

| Signature | Behavior |
| --- | --- |
| `void background(Color color)` | Clear and fill the entire canvas using an identity transform, then restore the previous context styles and transform. |
| `void fill(Color color)` | Set the fill for filled shapes and text. |
| `void stroke(Color color)` | Set the stroke for lines and outlines. |
| `void strokeWidth(double pixels)` | Set line width. |
| `void textSize(double pixels)` | Set a default JavaFX font at this size. |
| `void rect(double x, double y, double width, double height)` | Draw a filled rectangle with its top-left corner at x/y. |
| `void outlineRect(double x, double y, double width, double height)` | Draw a stroked rectangle with its top-left corner at x/y. |
| `void circle(double centreX, double centreY, double diameter)` | Draw a filled circle centred at x/y with the supplied diameter. |
| `void line(double x1, double y1, double x2, double y2)` | Draw a stroked line between the points. |
| `void text(String value, double x, double y)` | Draw filled text. By default y is its baseline. |

Drawing helpers use the native `GraphicsContext`, including settings changed
through `graphics()`. For other operations, use that context directly.

## Images

These GameApp methods are public and final. Drawing requires an existing
canvas. Import `Image` from `javafx.scene.image`.

| Signature | Behavior |
| --- | --- |
| `Image loadImage(String resourcePath)` | Load a bundled classpath image. A leading `/` starts at the resource root; otherwise the path is relative to your app class's Java package. Throws `IllegalArgumentException` for missing or unreadable images. Each call loads again; no cache is kept. |
| `void image(Image image, double x, double y)` | Draw at x/y using the image's natural size. |
| `void image(Image image, double x, double y, double width, double height)` | Draw at x/y scaled to the supplied dimensions. |

## Input

These GameApp methods are public and final. Use after canvas creation.
Import `KeyCode` and `MouseButton` from `javafx.scene.input`.

| Signature | Result |
| --- | --- |
| `double mouseX()` | Latest tracked mouse x in canvas coordinates. Starts at canvas centre. |
| `double mouseY()` | Latest tracked mouse y in canvas coordinates. Starts at canvas centre. |
| `boolean keyDown(KeyCode key)` | Whether a key pressed with canvas focus is held. |
| `boolean mouseDown(MouseButton button)` | Whether a button pressed on the canvas is held. |

These report held state. Click the canvas to focus it. Native controls receive
normal typing. Losing canvas or window focus clears held input; owned releases
clear it even outside the canvas. Coordinates track canvas events and owned
drags, can leave its bounds, and do not continually track other controls.
While the canvas is focused, arrow presses are consumed for game input instead
of moving focus to another control. Tab still moves focus to native controls;
arrows in a focused text field keep their normal caret behavior.

## Lifecycle and extension hooks

### Public lifecycle methods

SimpleApp declares these final JavaFX lifecycle overrides. Let JavaFX call them.
Import `Stage` from `javafx.stage`.

| Signature | Behavior |
| --- | --- |
| `public final void start(Stage stage)` | Run `settings`, create the root/content, run `setup`, create the scene, configure/show the stage, then call `ready`. On startup failure, call `stop`, close the stage and rethrow. |
| `public final void stop()` | Call `shutdown`. JavaFX invokes this when the application stops. |

Use JavaFX's inherited `launch(args)` in `public static void main(String[] args)`.
Other inherited JavaFX APIs remain available; they are outside Zero's own API.

### Protected SimpleApp API

These hooks support framework extension. Students normally override `settings`,
`setup`, `update` and `draw`. Import `Scene` and `Node` from `javafx.scene`,
`BorderPane` from `javafx.scene.layout`, and `Stage` from `javafx.stage`.

| Signature | Default behavior |
| --- | --- |
| `protected final double initialWidth()` | Return configured initial width (default 800). Cannot be overridden. |
| `protected final double initialHeight()` | Return configured initial height (default 500). Cannot be overridden. |
| `protected Node createContent()` | Return initial centre content; default `null`. Called before `setup`. |
| `protected Scene createScene(BorderPane content)` | Create a scene containing the root at the configured initial dimensions. Called after `setup`. |
| `protected void ready(Stage stage)` | No action. Called after the stage is shown. |
| `protected void shutdown()` | No action. Called by `stop`, including startup-failure cleanup. |

### Protected GameApp overrides

GameApp supplies these final overrides; subclasses cannot replace them.

| Signature | Behavior |
| --- | --- |
| `protected final Node createContent()` | Create the canvas, graphics context, layout and canvas input handlers; initialise mouse coordinates; return the layout. |
| `protected final Scene createScene(BorderPane content)` | Create a scene sized from its content, allowing room for controls around the canvas. |
| `protected final void ready(Stage stage)` | Install scene/window input handling, request canvas focus and start the frame timer. |
| `protected final void shutdown()` | Stop the timer if present and clear held input. |

Settings, setup, frames and JavaFX handlers run on the JavaFX application thread.
A failed frame stops the timer, clears held input and reports the exception.
Closing the app also stops its timer.

The readable [SimpleApp source](src/main/java/zero/SimpleApp.java) and
[GameApp source](src/main/java/zero/GameApp.java) are the authority for a
locally modified framework. Ordinary JavaFX controls and example classes such as
ScoreDisplay, Player and Question have their own APIs; see the
[app guide](APP-GUIDE.md) for their use.

The source starter includes JavaFX controls, graphics and media. Use ordinary
JavaFX `AudioClip` for short sound effects; see the [app guide](APP-GUIDE.md#short-sound-effects).
AudioClip is not a Zero helper. Persistence, FXML and web need their own dependencies.
ZeroHub provides exact-version shared libraries through ordinary Java imports;
it does not change this core API or require a component base class. Public activation is pending.
