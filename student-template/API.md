# Zero API reference

The complete public/protected API declared by `zero.App`, `zero.GameApp`,
`zero.ImageRegion`, `zero.SpriteAnimation`, `zero.Actor`, `zero.Collisions`,
`zero.Sound`, `zero.Music`, `zero.Color` and the `zero.ui` classes below.
Actor, zero.Color and zero.ui are local source additions and are unreleased. Mac setup 0.5.23 includes
the earlier image, animation, collision and audio helpers with core 0.2.1. Older downloads keep
their bundled API; use their own reference when working with an older kit.
Learn through the [tutorials](lessons/00-hello-world.md); use this reference to
look up methods. Installation and troubleshooting are in [setup help](README.md).

[App](#app) · [GameApp](#gameapp) · [Game flow](#game-flow) ·
[Zero UI](#zerouielement) · [Color](#color) · [Canvas](#canvas) · [Drawing](#drawing) · [Images](#images) ·
[ImageRegion](#imageregion) · [SpriteAnimation](#spriteanimation) ·
[Actor](#actor) · [Collisions](#collisions) · [Audio](#audio) · [Sound](#sound) · [Music](#music) · [Input](#input) · [Lifecycle and extension hooks](#lifecycle-and-extension-hooks)

## App

`public abstract class App extends javafx.application.Application`

Extend `zero.App` for event-driven interfaces. It has an implicit public
no-argument constructor. The default window is resizable, 800 × 500 pixels,
with title `"Zero"` and zero content-edge padding. Import JavaFX `Node` from `javafx.scene`.

Normal Run builds and opens a native JavaFX window. Publishing for the browser
checks the supported Java/JavaFX subset; unsupported calls produce source
diagnostics. Availability in native JavaFX does not imply browser support.
See [running and browser compatibility](https://zero.codepet.ca/docs/setup#edit-and-run).

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
| `void padding(double pixels)` | Set space around all four content edges in `settings()`, `setup()` or later JavaFX handlers. The number must be non-negative and finite. Default: 0. GameApp keeps its fixed canvas size. |
| `void show(zero.ui.Element content)` | Replace the root's centre with a non-null Zero element in `setup()` or later. On GameApp, navigate away from its retained canvas/HUD and suspend gameplay update, draw and canvas input until showGame(). No history stack is stored. |
| `void show(Node content)` | Replace the root's centre with a non-null JavaFX node, in `setup()` or later. No screen history is stored. On GameApp this navigates away from the retained canvas/HUD and suspends gameplay update, draw and canvas input until showGame(). |

`size` and `title` throw `IllegalStateException` outside `settings()`;
invalid dimensions or padding throw `IllegalArgumentException`. `show` throws `IllegalStateException`
before content creation. Null title/content throws `NullPointerException`.
`size` and `title` do not change an already-open window.

GameApp inherits `padding` from App. `padding(20)` sets 20 pixels on every edge;
repeated calls replace the amount,
and `padding(0)` removes it. Invalid padding leaves the previous amount unchanged.
App keeps its configured initial window content size, leaving less room for
controls. GameApp's initial window includes padding around its fixed canvas and
controls; canvas dimensions and drawing coordinates stay unchanged. Later padding
changes rearrange content within the current window without resizing it.

## GameApp

`public abstract class GameApp extends App`

Extend `zero.GameApp` for animation and canvas input. It has an implicit public
no-argument constructor and inherits all App public methods above.
Its canvas exists before `setup()`. It starts frames after showing the window.

| Public callback | Behavior |
| --- | --- |
| `void update(double seconds)` | Runs before `draw()` while gameplay is visible and not explicitly paused. Update your state and objects explicitly. Default: no action. |
| `void draw()` | Runs while gameplay is visible, after `update()` when not paused. Draw the current state. Default: no action. |

The first frame receives `0` seconds; later elapsed times are capped at `0.1`.
Frame rate is variable. While gameplay is visible, draw continues during an explicit pause, but update is skipped. Navigating away with show suspends both callbacks. The canvas is not automatically cleared; drawing styles
persist. Resizing the window does not scale its fixed canvas. Native controls
around the canvas can enlarge the initial window.

## Game flow

These GameApp methods are public and final. Call them on the JavaFX application
thread in `setup()` or later UI/game callbacks. They require the game layout to
exist and the app must not have stopped, or they throw `IllegalStateException`. The canvas and its controls panel are
retained when `show(Node)` or `show(Element)` displays another view. showGame
returns to that same gameplay view; it does not rebuild actors, reset scores or
restart a level. Main owns those rules.

Navigation requested inside update or draw takes effect after the current draw,
so the current update/draw pair finishes together. The last navigation request
in that frame wins; a failed frame or app stop discards pending navigation. A request in an idle UI callback
commits immediately. Navigation and pause/resume clear held and edge canvas input; returning with showGame
or calling resume clears input and resets elapsed time so the next update gets 0
seconds, with no time accumulated while away. Explicit pause and navigation are
separate: returning to gameplay preserves an explicit pause until resume is called.
Native button callbacks remain available while paused or on another view. Game
pause/navigation does not automatically pause music.

isPaused reports only the explicit pause flag, not whether another view is showing.

A title, help, pause or results screen can be an ordinary student class with a
method returning an Element. There is no `zero.Screen` class, automatic screen
lifecycle or navigation history in this API.

| Signature | Behavior |
| --- | --- |
| `void showGame()` | Return to the retained gameplay canvas and HUD, clearing input and elapsed time. Preserve explicit pause state. |
| `void pause()` | Explicitly pause gameplay updates. Visible gameplay still draws and UI callbacks still run. |
| `void resume()` | Clear explicit pause, input and elapsed time. Resume gameplay updates only when gameplay is visible. |
| `boolean isPaused()` | Read whether gameplay has been explicitly paused. |

## zero.ui.Element

`public abstract class Element` is the base for the small Zero UI layer. Import
`zero.ui.Element`, `zero.ui.Label`, `zero.ui.Button`, `zero.ui.TextField` and `zero.ui.Column` as needed.
These are additional, unreleased APIs; existing JavaFX controls remain available.
Use `App.show(element)` for an interface or `GameApp.controls(element)` for a live
game HUD. Each element wraps one node and can belong to only one parent at a time.
Create, change and mount elements on the JavaFX application thread (in setup or
callbacks). A Column's children are supplied only in its constructor; there is
no public add/remove/reparent API in this slice.

The protected constructor and fxNode are an advanced JavaFX interoperability
bridge for custom elements, not a requirement for using Label/Button/TextField/Column.
Subclasses wrap their own node or a newly created Column's node. Null backing
nodes throw `NullPointerException`; the bridge exposes the actual node rather
than a copy. Advanced code must preserve JavaFX ownership/thread rules.

| Signature | Behavior |
| --- | --- |
| `protected Element(Node node)` | Wrap a non-null JavaFX node in a custom Element subclass. |
| `final Node fxNode()` | Return the underlying JavaFX node for advanced interoperability. Inherited by Label, Button, TextField and Column. |

## zero.ui.Label

`public class Label extends Element` displays text. Import `zero.ui.Label`.
Text must be non-null; constructors/setters throw `NullPointerException` for null.
It inherits `fxNode()` from Element.

| Signature | Behavior |
| --- | --- |
| `Label(String text)` | Create a text label. |
| `String getText()` | Read its current text. |
| `void setText(String text)` | Replace its text explicitly. |

## zero.ui.Button

`public class Button extends Element` is a clickable button. Import `zero.ui.Button`.
It inherits `fxNode()`. Text and callbacks must be non-null or
`NullPointerException` is thrown. The callback is an ordinary `java.lang.Runnable`:
write `button.onClick(() -> score.setScore(1))`, with no event argument. Calling
onClick again replaces the previous callback; it does not accumulate handlers.

| Signature | Behavior |
| --- | --- |
| `Button(String text)` | Create a button with no click callback yet. |
| `String getText()` | Read its current text. |
| `void setText(String text)` | Replace its text explicitly. |
| `void onClick(Runnable action)` | Replace the click callback with a non-null action. |

## zero.ui.TextField

`public class TextField extends Element` accepts one line of text. Import
`zero.ui.TextField`. It inherits `fxNode()`. Text and prompt start empty.
Read getText inside a Button.onClick callback to use the text entered at that
moment. A prompt is a hint shown when the field is empty; it is not entered text.
Typing and Tab navigation retain the native control's focus behavior.
Both setters reject null with `NullPointerException` and keep the previous value.
Use an empty string to remove text or a prompt. Create and change it in setup or
UI callbacks on the application thread, like the other elements.

| Signature | Behavior |
| --- | --- |
| `TextField()` | Create an empty single-line text field with an empty prompt. |
| `String getText()` | Read the current text, including edits typed by the user. |
| `void setText(String text)` | Replace the text with a non-null string; an empty string removes entered text. |
| `String getPromptText()` | Read the current prompt hint. |
| `void setPromptText(String text)` | Replace the prompt with a non-null string; this does not change entered text. |

## zero.ui.Column

`public class Column extends Element` arranges child elements vertically. Import
`zero.ui.Column`. It inherits `fxNode()`. The no-spacing constructor uses 8 pixels.
Spacing must be finite and non-negative or `IllegalArgumentException` is thrown.
Null children/child array throw `NullPointerException`; duplicate children or
children whose nodes already have a parent or scene throw `IllegalArgumentException`.
The complete list is validated before any child is attached. Children are fixed
at construction; create fresh elements for a different composition instead of
trying to attach one child to two parents. Empty columns are allowed.

| Signature | Behavior |
| --- | --- |
| `Column(Element... children)` | Create a vertical column with 8-pixel spacing and the supplied children in order. |
| `Column(double spacing, Element... children)` | Create a vertical column with finite non-negative pixel spacing. |
| `double getSpacing()` | Read spacing in pixels. |
| `void setSpacing(double spacing)` | Replace finite non-negative spacing; invalid values leave the old value unchanged. |

## Color

`public final class Color` is a small colour value wrapper. Import `zero.Color`
for these constants and rgb; the platform colour is private. It has no public
constructor. Existing overloads taking `javafx.scene.paint.Color` remain available;
the short `Color` type in their older drawing signatures below means JavaFX Color.
The explicitly qualified `zero.Color` overloads take the new wrapper. Import only
one Color class by its short name, or qualify the other where needed.
Each rgb channel must be an integer from 0 through 255 inclusive; otherwise
`IllegalArgumentException` is thrown.

| Signature | Behavior |
| --- | --- |
| `static final Color WHITE` | Opaque white. |
| `static final Color BLACK` | Opaque black. |
| `static final Color BLUE` | Opaque blue. |
| `static final Color GOLD` | Opaque gold. |
| `static Color rgb(int red, int green, int blue)` | Create an opaque colour from integer channels, each from 0 through 255. |

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
| `void controls(zero.ui.Element content)` | Mount a non-null Zero HUD/control panel at the bottom of the game layout in `setup()` or later, retaining the canvas and gameplay state. This does not navigate back or resume explicit pause. Replace the previous panel; do not steal nodes from another parent. Throws `IllegalStateException` before canvas creation, `NullPointerException` for null, and `IllegalArgumentException` for content owned by another parent or scene. Reusing the current bottom panel is allowed. |
| `void draw(Actor actor)` | Draw a non-null actor explicitly through its existing draw(GameApp) entry point. The base Actor entry point provides a scoped local drawing callback; this never updates or registers the actor. Null actor throws `NullPointerException`; the base Actor entry point throws `IllegalStateException` before canvas creation. |
| `BorderPane layout()` | Layout with the canvas in its centre. Add native controls to its other positions. |

## Drawing

These GameApp methods are public and final. Call them after canvas creation.
Coordinates use canvas pixels: `(0, 0)` is the top left; y increases downward.
Import `Color` from `javafx.scene.paint`.

| Signature | Behavior |
| --- | --- |
| `void background(zero.Color color)` | Clear and fill the entire canvas, restoring the previous styles and transform. Use the new Zero colour wrapper; null throws `NullPointerException`. |
| `void background(Color color)` | Clear and fill the entire canvas using an identity transform, then restore the previous context styles and transform. |
| `void fill(zero.Color color)` | Set the fill for filled shapes and text. Use the new Zero colour wrapper; null throws `NullPointerException`. |
| `void fill(Color color)` | Set the fill for filled shapes and text. |
| `void stroke(zero.Color color)` | Set the stroke for lines and outlines. Use the new Zero colour wrapper; null throws `NullPointerException`. |
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

These GameApp methods are public and final. Drawing requires an existing
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

## Actor

`public class Actor` is an optional ordinary Java object you can extend. Import
`zero.Actor`. Its x/y position is the actor's **centre**. With artwork, its initial
size is the image/frame's natural size. `Actor(x, y)` has no artwork and starts
with logical width/height 1; override draw() to draw shapes. Rotation starts at 0 (facing right); positive
degrees turn clockwise and rotation is normalized to [0, 360).

Main explicitly calls `actor.update(seconds)` and `draw(actor)`; there is no
registration or automatic lifecycle. Default update advances only the assigned
SpriteAnimation; drawing never advances it. Override update for your own movement,
and call `super.update(seconds)` to keep animation running. Use separate animation
objects for independent clocks. Sharing one SpriteAnimation shares its clock,
so updating two actors with it advances that same clock twice.

Numeric arguments for construction, position, size, movement, rotation and
elapsed time must be finite; sizes must be strictly positive, seconds
must be non-negative, and moveToward speed must be non-negative. moveForward
accepts signed speed (negative moves backward). Null references throw
`NullPointerException`; invalid arguments, unloaded/failed images and non-finite
movement results throw `IllegalArgumentException` without changing actor state.
Image replacements keep position, size and rotation, and do not reset the supplied
animation's clock. A target at the current position leaves rotation unchanged.

Actor adds no collision shape or automatic collision response. Use Collisions
explicitly; for a rectangular test use top-left `actor.x() - actor.width() / 2`
and `actor.y() - actor.height() / 2`. Rotation does not rotate that test rectangle.
This class is an unreleased local source addition; older kits are unchanged.

| Signature | Behavior |
| --- | --- |
| `Actor(double x, double y)` | Create an actor centred at finite x/y with no artwork and logical size 1 × 1. |
| `Actor(Image image, double x, double y)` | Create an actor centred at x/y using a loaded image's natural dimensions. |
| `Actor(ImageRegion region, double x, double y)` | Create an actor centred at x/y using the region's natural dimensions. |
| `Actor(SpriteAnimation animation, double x, double y)` | Create an actor centred at x/y using the current frame's natural dimensions, preserving the animation clock. |
| `final double x()` | Read the horizontal centre in canvas pixels. |
| `final double y()` | Read the vertical centre in canvas pixels. |
| `final double width()` | Read the drawing width in pixels. |
| `final double height()` | Read the drawing height in pixels. |
| `final double rotation()` | Read clockwise degrees in [0, 360), with 0 facing right. |
| `final void setPosition(double x, double y)` | Set the centre to finite x/y. |
| `final void setSize(double width, double height)` | Set strictly positive finite drawing dimensions. |
| `final void setRotation(double degrees)` | Set finite clockwise degrees, normalized to [0, 360). |
| `final void move(double dx, double dy)` | Add finite offsets to the centre; reject non-finite results before changing either coordinate. |
| `final void moveForward(double speed, double seconds)` | Move in the facing direction by signed pixels-per-second speed times non-negative seconds. Reject non-finite results atomically. |
| `final void rotate(double degrees)` | Add finite clockwise degrees and normalize to [0, 360). |
| `final void face(double targetX, double targetY)` | Face a finite target point; a target at the centre leaves rotation unchanged. |
| `final void moveToward(double targetX, double targetY, double speed, double seconds)` | Face and approach a finite target at non-negative pixels-per-second speed for non-negative seconds. Stop exactly at the target without overshooting; reject non-finite results atomically. |
| `final void setImage(Image image)` | Replace the sprite with a loaded image, keeping size, position and rotation. |
| `final void setImage(ImageRegion region)` | Replace the sprite with a region, keeping size, position and rotation. |
| `final void setImage(SpriteAnimation animation)` | Replace the sprite with an animation, preserving its clock and actor size, position and rotation. |
| `void update(double seconds)` | Advance the assigned animation by finite non-negative seconds; perform no automatic movement. |
| `void draw(GameApp app)` | Existing overridable drawing entry point, called by GameApp.draw(actor). The base implementation establishes this actor/app drawing scope, translates to x/y, rotates, invokes draw(), and restores the prior drawing context, styles and transform in finally. Legacy overrides still run. |
| `void draw()` | Override to draw in actor-local coordinates, with (0, 0) at its centre and the actor rotation already applied. Default: draw its sprite centred and scaled to width/height, or do nothing when there is no artwork. Never advances animation. |

### Protected Actor drawing helpers

These protected final methods are available inside an Actor subclass. Call them
only during that actor's active base draw(GameApp) scope, normally from its draw()
callback; otherwise they throw `IllegalStateException` with useful guidance.
They delegate to the supplied app without a static current-app field. Exceptions restore the previous context, styles and transform. Main.draw(actor)
uses canvas coordinates; drawing another actor inside an actor callback composes
the current parent transform, so that nested actor's position is relative to it.
Each nested scope restores its caller's state.

Import `zero.Color` for fill/stroke. Coordinates are local canvas pixels: positive
x points right and positive y points down before the actor's clockwise rotation.
setSize changes logical dimensions and default sprite size; it does not scale
custom drawing coordinates. Use width()/height() explicitly if your shapes
should follow logical size. Shapes add no collision geometry.

GameApp.draw(actor) deliberately calls actor.draw(app), preserving old overrides.
An override of draw(GameApp) that does not call super controls its own drawing;
the scoped callback/helpers are supplied by the base implementation. Prefer
no-argument draw() for new Actor subclasses. Main still explicitly updates and
draws each object, with no implicit registration or lifecycle.

| Signature | Behavior |
| --- | --- |
| `protected final void fill(zero.Color color)` | Set local shape/text fill using a non-null zero.Color. |
| `protected final void stroke(zero.Color color)` | Set local outline/line stroke using a non-null zero.Color. |
| `protected final void strokeWidth(double pixels)` | Set line width through the active drawing app. |
| `protected final void textSize(double pixels)` | Set text size through the active drawing app. |
| `protected final void rect(double x, double y, double width, double height)` | Draw a filled rectangle from its local top-left x/y. |
| `protected final void outlineRect(double x, double y, double width, double height)` | Draw an outlined rectangle from its local top-left x/y. |
| `protected final void circle(double centreX, double centreY, double diameter)` | Draw a filled circle with a local centre and a diameter, not a radius. |
| `protected final void line(double x1, double y1, double x2, double y2)` | Draw a line between local endpoints. |
| `protected final void text(String value, double x, double y)` | Draw text at local x/y using the current baseline convention. |
| `protected final void textCentered(String value, double x, double y)` | Centre text horizontally about local x using the current baseline convention. |

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

## Audio

These App methods are public and final, and are inherited by GameApp.
Load in `setup()` and keep fields for playback from a button or game event.
Put audio in `src/main/resources`; a leading `/` starts at the resource root,
otherwise paths are relative to your app class's Java package. Use supported
JavaFX audio formats, such as PCM WAV. Missing or unreadable audio reports the
resource path in an `IllegalArgumentException`; failed loads are not cached.

| Signature | Behavior |
| --- | --- |
| `Sound loadSound(String resourcePath)` | Load a short sound effect. Successful loads are cached per app by canonical resource URL: aliases return the same live Sound, including its volume/mute state. Loading after manually closing that Sound creates a fresh one. |
| `Music loadMusic(String resourcePath)` | Create an independent buffered music player. Each call owns its own position, volume and mute state, even for the same resource. |

Sound stores decoded samples in memory for short, overlapping effects. Music uses
JavaFX MediaPlayer buffering for longer tracks. Load once rather than once per
frame. The app closes owned audio on stop, window close, startup failure and
frame failure. Call loaders, controls and close on the JavaFX application thread
(`setup`, `update` and JavaFX event handlers already do this). Main still explicitly decides when game pause, restart or focus
loss should pause/stop music. Raw JavaFX AudioClip and MediaPlayer remain available
for advanced needs; the app manages only audio created through these loaders.

## Sound

`public final class Sound implements AutoCloseable` has no public constructor.
Import `zero.Sound` and obtain one with `loadSound`. The default volume is 1 and
mute is false. Volume must be finite and between 0 and 1 inclusive, otherwise
`IllegalArgumentException` is thrown. Muting preserves the chosen volume. Closing is idempotent; afterward controls
throw a useful `IllegalStateException`, while getters remain readable.

| Signature | Behavior |
| --- | --- |
| `void play()` | Play the short effect unless muted; repeated calls can overlap. |
| `void stop()` | Stop all playback of this sound. |
| `void setVolume(double volume)` | Set the volume for subsequent plays from 0 (silent) to 1 (full). |
| `double getVolume()` | Return the chosen volume, independent of mute. |
| `void setMuted(boolean muted)` | Muting stops active effects and silences new plays, without changing the chosen volume. Unmuting does not replay stopped effects. |
| `boolean isMuted()` | Whether this sound is muted. |
| `boolean isPlaying()` | Whether this sound currently has active playback. |
| `void close()` | Stop playback and mark this sound closed. |

## Music

`public final class Music implements AutoCloseable` has no public constructor.
Import `zero.Music` and obtain one with `loadMusic`. Each instance has independent
playback. The default volume is 1 and mute is false. Volume must be finite and
between 0 and 1 inclusive; invalid values throw `IllegalArgumentException`.
Muting preserves the chosen volume. Readiness and actual playback are asynchronous.
Asynchronous player failures report the resource path once and dispose the player;
later controls throw a useful failed-player error. Closing is idempotent; after
close controls throw `IllegalStateException`, while getters remain readable.

| Signature | Behavior |
| --- | --- |
| `void play()` | Start or resume playback; after natural completion, start again. Preserve the selected repeat mode. |
| `void loop()` | Select repeating playback and start or resume it. |
| `void pause()` | Pause playback while preserving its position. |
| `void stop()` | Stop playback and rewind to the beginning, preserving the selected repeat mode. |
| `void setVolume(double volume)` | Set the volume from 0 (silent) to 1 (full). |
| `double getVolume()` | Return the chosen volume, independent of mute. |
| `void setMuted(boolean muted)` | Mute or unmute playback without changing the chosen volume. |
| `boolean isMuted()` | Whether this player is muted. |
| `boolean isPlaying()` | Whether this player currently reports active playback. |
| `void close()` | Stop playback and dispose the owned player. |

## Input

These GameApp methods are public and final. Use after canvas creation.
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

App declares these final JavaFX lifecycle overrides. Let JavaFX call them.
Import `Stage` from `javafx.stage`.

| Signature | Behavior |
| --- | --- |
| `public final void start(Stage stage)` | Run `settings`, create the root/content, run `setup`, create the scene, configure/show the stage, then call `ready`. On startup failure, call `stop`, close the stage and rethrow. |
| `public final void stop()` | Call `shutdown` at most once per app and close owned audio on every call. Window hiding and JavaFX application exit can both call stop; the extension hook is not repeated. |

Use JavaFX's inherited `launch(args)` in `public static void main(String[] args)`.
Other inherited JavaFX APIs remain available; they are outside Zero's own API.

### Protected App API

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
| `protected void shutdown()` | No action. Called at most once by `stop`, including startup-failure cleanup. |

### Protected GameApp overrides

GameApp supplies these final overrides; subclasses cannot replace them.

| Signature | Behavior |
| --- | --- |
| `protected final Node createContent()` | Create the canvas, graphics context, layout and canvas input handlers; initialise mouse coordinates; return the layout. |
| `protected final Scene createScene(BorderPane content)` | Create a scene sized from its content, allowing room for controls around the canvas. |
| `protected final void ready(Stage stage)` | Install scene/window input handling, request canvas focus when gameplay input is enabled, and start the single frame driver. |
| `protected final void shutdown()` | Stop the timer if present, clear all input and the image cache, and forget the window. |

Settings, setup, frames and JavaFX handlers run on the JavaFX application thread.
A failed frame stops the timer, clears held input, closes owned audio and reports the exception.
Closing the app also stops its timer.

The readable [App source](src/main/java/zero/App.java) and
[GameApp source](src/main/java/zero/GameApp.java) are the authority for a
locally modified framework. Ordinary JavaFX controls and example classes such as
ScoreDisplay, Player and Question have their own APIs; see the
[object lesson](lessons/06-objects.md), [Player lesson](lessons/08-movement.md#how-player-uses-the-app-to-draw)
and [reusable views lesson](lessons/10-components.md#reusable-views) for their use.

The source starter includes JavaFX controls, graphics and media. Use `loadSound` for effects and `loadMusic` for tracks; see the
[audio reference](#audio). Raw JavaFX AudioClip/MediaPlayer
remain available. Persistence, FXML and web need their own dependencies.
ZeroHub provides exact-version shared libraries through ordinary Java imports;
it does not change this core API or require a component base class. Public managed library admission remains gated; local checks and pinned
consumption do not establish public acceptance.
