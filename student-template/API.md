# Zero API reference

The complete public/protected API declared by `zero.SimpleApp`, `zero.SketchApp`,
`zero.ImageRegion`, `zero.SpriteAnimation` and `zero.Collisions`.
The game helpers are local, unreleased source additions. Published Mac setup
0.5.15 still ships the older core 0.1.2; these additions need this source starter.
For setup, explanations and complete examples, see the [app guide](APP-GUIDE.md)
or [starter guide](README.md).

[SimpleApp](#simpleapp) · [SketchApp](#sketchapp) ·
[Canvas](#canvas) · [Drawing](#drawing) · [Images](#images) ·
[ImageRegion](#imageregion) · [SpriteAnimation](#spriteanimation) ·
[Collisions](#collisions) · [Input](#input) · [Lifecycle and extension hooks](#lifecycle-and-extension-hooks)

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
| `void size(double width, double height)` | Set initial content dimensions in pixels, inside `settings()` only. Dimensions must be positive and finite. On SketchApp, these are fixed canvas dimensions. |
| `void title(String title)` | Set a non-null initial window title, inside `settings()` only. |
| `void padding(double pixels)` | Set equal space around every content edge, inside `settings()` only. The number must be non-negative and finite. Default: 0. Space is inside the window dimensions; a sketch keeps its fixed canvas size. |
| `void show(Node content)` | Replace the root's centre with a non-null JavaFX node, in `setup()` or later. No screen history is stored. On SketchApp this replaces the visible sketch layout while its loop continues. |

`size`, `title` and `padding` throw `IllegalStateException` outside `settings()`;
invalid dimensions or padding throw `IllegalArgumentException`. `show` throws `IllegalStateException`
before content creation. Null title/content throws `NullPointerException`.
`size`, `title` and `padding` do not change an already-open window.

## SketchApp

`public abstract class SketchApp extends SimpleApp`

Extend `zero.SketchApp` for animation and canvas input. It has an implicit public
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

These SketchApp methods are public and final. Call them in `setup()` or later,
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

These SketchApp methods are public and final. Call them after canvas creation.
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
| `void textCentered(String value, double x, double y)` | Draw text horizontally centred at x, using the current font, fill and text baseline convention at y. Restore the previous text alignment afterward. |

Drawing helpers use the native `GraphicsContext`, including settings changed
through `graphics()`. For other operations, use that context directly.

## Images

These SketchApp methods are public and final. Drawing requires an existing
canvas. Import `Image` from `javafx.scene.image`.

| Signature | Behavior |
| --- | --- |
| `Image loadImage(String resourcePath)` | Load a bundled classpath image. A leading `/` starts at the resource root; otherwise the path is relative to your app class's Java package. Throws `IllegalArgumentException` for missing or unreadable images. Successful loads are cached per app by canonical resolved resource URL, including path aliases. The same resource returns the same Image until shutdown clears the cache; failed loads are not cached. |
| `void image(Image image, double x, double y)` | Draw at x/y using the image's natural size. |
| `void image(Image image, double x, double y, double width, double height)` | Draw at x/y scaled to the supplied dimensions. |
| `SpriteAnimation loadAnimation(String resourcePath, int columns, int rows, double fps)` | Create a new independent looping animation over the cached image. Grid cells must divide its pixel dimensions exactly. |
| `ImageRegion imageRegion(Image image, double x, double y, double width, double height)` | Create a validated source rectangle in an image without copying pixels. |
| `void image(ImageRegion region, double x, double y)` | Draw the region at top-left x/y at its natural frame size. |
| `void image(ImageRegion region, double x, double y, double width, double height)` | Draw the region at top-left x/y scaled to the supplied dimensions. |
| `void image(SpriteAnimation animation, double x, double y)` | Draw the current animation frame without advancing it at top-left x/y at its natural frame size. |
| `void image(SpriteAnimation animation, double x, double y, double width, double height)` | Draw the current animation frame without advancing it at top-left x/y scaled to the supplied dimensions. |
| `void imageCentered(Image image, double x, double y, double width, double height, double angleDegrees)` | Draw scaled about destination centre x/y, rotating by angleDegrees; positive angles turn clockwise in canvas coordinates. Restore styles and transform afterward; animation does not advance. |
| `void imageCentered(ImageRegion region, double x, double y, double width, double height, double angleDegrees)` | Draw scaled about destination centre x/y, rotating by angleDegrees; positive angles turn clockwise in canvas coordinates. Restore styles and transform afterward; animation does not advance. |
| `void imageCentered(SpriteAnimation animation, double x, double y, double width, double height, double angleDegrees)` | Draw scaled about destination centre x/y, rotating by angleDegrees; positive angles turn clockwise in canvas coordinates. Restore styles and transform afterward; animation does not advance. |
| `void imageFlippedY(Image image, double x, double y, double width, double height)` | Draw scaled and vertically reflected inside the destination rectangle with top-left x/y. Restore styles and transform afterward; animation does not advance. |
| `void imageFlippedY(ImageRegion region, double x, double y, double width, double height)` | Draw scaled and vertically reflected inside the destination rectangle with top-left x/y. Restore styles and transform afterward; animation does not advance. |
| `void imageFlippedY(SpriteAnimation animation, double x, double y, double width, double height)` | Draw scaled and vertically reflected inside the destination rectangle with top-left x/y. Restore styles and transform afterward; animation does not advance. |

Load assets in setup. Cached images remain in memory until app shutdown; regions
and animations retain the same backing Image without bitmap copies. Each
animation owns a separate clock: call its update(seconds) explicitly once per
app update. Drawing never updates it.

## ImageRegion

`public final class ImageRegion` is an immutable source rectangle. Import
`zero.ImageRegion`. Coordinates are in source-image pixels. Null image throws
`NullPointerException`; an unloaded/failed image, non-finite coordinates, negative
x/y, non-positive dimensions or an out-of-bounds rectangle throw
`IllegalArgumentException`. No pixels are copied.

| Signature | Result |
| --- | --- |
| `ImageRegion(Image image, double x, double y, double width, double height)` | Construct a validated rectangle sharing the supplied image. |
| `Image image()` | Original backing image, with identity preserved. |
| `double x()` | Source rectangle left edge. |
| `double y()` | Source rectangle top edge. |
| `double width()` | Source rectangle width. |
| `double height()` | Source rectangle height. |

## SpriteAnimation

`public final class SpriteAnimation` is an ordinary explicitly updated object.
Import `zero.SpriteAnimation`. Regular sheets use equal aligned cells in
row-major order, left to right then top to bottom. Trim outer margins and spacing
before using a grid; arbitrary artwork is not automatically aligned. For an
irregular atlas, supply equal-size ImageRegion frames from one shared Image.
The explicit sequence clones the array, retaining its immutable region objects.
Null inputs throw `NullPointerException`; invalid grids, frames, fps or seconds
throw `IllegalArgumentException`. There is no automatic registration or update.

| Signature | Result |
| --- | --- |
| `SpriteAnimation(Image image, int columns, int rows, double fps)` | Construct a looping grid animation at frame 0. Positive columns/rows must divide the loaded image dimensions exactly; fps must be positive and finite. |
| `SpriteAnimation(double fps, ImageRegion... frames)` | Construct a non-empty looping sequence of equal-size regions from the same Image. Positive finite fps is required; columns is the frame count and rows is 1. |
| `void update(double seconds)` | Advance and loop this object only. Seconds must be non-negative and finite. |
| `void reset()` | Return this clock to frame 0, including fractional elapsed time. |
| `ImageRegion frame()` | Current frame region; does not advance. |
| `int frameIndex()` | Current zero-based frame index. |
| `int frameCount()` | Total number of frames. |
| `int columns()` | Grid columns, or explicit sequence length. |
| `int rows()` | Grid rows, or 1 for an explicit sequence. |
| `double fps()` | Configured frames per second. |
| `Image image()` | Shared backing image. |

## Collisions

`public final class Collisions` has no public constructor. Import `zero.Collisions`
and call its static predicates. Rectangles use top-left x/y; circles use centre
x/y and radius (unlike drawing circle, which accepts a diameter). Touching counts
as a hit, including zero-size shapes. All values must be finite; dimensions and
radii must be non-negative, otherwise `IllegalArgumentException` is thrown.
These tests do not move objects or resolve physics.

| Signature | Result |
| --- | --- |
| `static boolean circleHitsRect(double cx, double cy, double radius, double x, double y, double width, double height)` | Whether a circle touches or overlaps an axis-aligned rectangle. |
| `static boolean rectHitsRect(double x1, double y1, double width1, double height1, double x2, double y2, double width2, double height2)` | Whether two axis-aligned rectangles touch or overlap. |
| `static boolean circleHitsCircle(double x1, double y1, double radius1, double x2, double y2, double radius2)` | Whether two circles touch or overlap. |

## Input

These SketchApp methods are public and final. Use after canvas creation.
Import `KeyCode` and `MouseButton` from `javafx.scene.input`.

| Signature | Result |
| --- | --- |
| `double mouseX()` | Latest tracked mouse x in canvas coordinates. Starts at canvas centre. |
| `double mouseY()` | Latest tracked mouse y in canvas coordinates. Starts at canvas centre. |
| `boolean keyDown(KeyCode key)` | Whether a key pressed with canvas focus is held. |
| `boolean mouseDown(MouseButton button)` | Whether a button pressed on the canvas is held. |
| `boolean keyPressed(KeyCode key)` | Whether a new press occurred for the current update/draw frame. Repeated queries do not consume it; holding does not repeat it. |
| `boolean mousePressed(MouseButton button)` | Whether a new canvas button press occurred for the current update/draw frame. Repeated queries do not consume it. |
| `boolean windowFocused()` | Whether the app window has focus, including when a native control owns keyboard focus. False before the window exists or after shutdown. |

keyDown/mouseDown report held state. keyPressed/mousePressed report edges: even
a press and release between frames is visible throughout the next real update
and draw, then cleared. Pausing your own game logic does not retain an edge
beyond that frame. Losing focus clears held, pending and frame input. Window
focus does not imply canvas focus and does not automatically pause a game. Click the canvas to focus it. Native controls receive
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

### Protected SketchApp overrides

SketchApp supplies these final overrides; subclasses cannot replace them.

| Signature | Behavior |
| --- | --- |
| `protected final Node createContent()` | Create the canvas, graphics context, layout and canvas input handlers; initialise mouse coordinates; return the layout. |
| `protected final Scene createScene(BorderPane content)` | Create a scene sized from its content, allowing room for controls around the canvas. |
| `protected final void ready(Stage stage)` | Install scene/window input handling, request canvas focus and start the frame timer. |
| `protected final void shutdown()` | Stop the timer if present, clear all input and the image cache, and forget the window. |

Settings, setup, frames and JavaFX handlers run on the JavaFX application thread.
A failed frame stops the timer, clears held input and reports the exception.
Closing the app also stops its timer.

The readable [SimpleApp source](src/main/java/zero/SimpleApp.java) and
[SketchApp source](src/main/java/zero/SketchApp.java) are the authority for a
locally modified framework. Ordinary JavaFX controls and example classes such as
ScoreDisplay, Player and Question have their own APIs; see the
[app guide](APP-GUIDE.md) for their use.

The source starter includes JavaFX controls, graphics and media. Use ordinary
JavaFX `AudioClip` for short sound effects; see the [app guide](APP-GUIDE.md#short-sound-effects).
AudioClip is not a Zero helper. Persistence, FXML and web need their own dependencies.
ZeroHub provides exact-version shared libraries through ordinary Java imports;
it does not change this core API or require a component base class. Public activation is pending.
