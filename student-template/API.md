# Zero API reference

The complete public/protected API declared by `zero.App`, `zero.GameApp`,
`zero.ImageRegion`, `zero.SpriteAnimation`, `zero.Collisions`, `zero.Sound` and
`zero.Music`.
Mac setup 0.5.23 includes these helpers with core 0.2.1. Older downloads keep
their bundled API; use their own reference when working with an older kit.
For setup, explanations and complete examples, see the [app guide](APP-GUIDE.md)
or [starter guide](README.md).

[App](#app) · [GameApp](#gameapp) ·
[Canvas](#canvas) · [Drawing](#drawing) · [Images](#images) ·
[ImageRegion](#imageregion) · [SpriteAnimation](#spriteanimation) ·
[Collisions](#collisions) · [Audio](#audio) · [Sound](#sound) · [Music](#music) · [Input](#input) · [Lifecycle and extension hooks](#lifecycle-and-extension-hooks)

## App

`public abstract class App extends javafx.application.Application`

Extend `zero.App` for event-driven interfaces. It has an implicit public
no-argument constructor. The default window is resizable, 800 × 500 pixels,
with title `"Zero"` and zero content-edge padding. Import JavaFX `Node` from `javafx.scene`.

Normal Run builds a browser preview and checks the supported Java/JavaFX subset.
Availability in native JavaFX does not imply browser support; unsupported calls
produce source diagnostics. The explicit native diagnostic runs a JavaFX window.
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
| `void padding(double pixels)` | Set equal space around every content edge, inside `settings()` only. The number must be non-negative and finite. Default: 0. Space is inside the window dimensions; a sketch keeps its fixed canvas size. |
| `void show(Node content)` | Replace the root's centre with a non-null JavaFX node, in `setup()` or later. No screen history is stored. On GameApp this replaces the visible sketch layout while its loop continues. |

`size`, `title` and `padding` throw `IllegalStateException` outside `settings()`;
invalid dimensions or padding throw `IllegalArgumentException`. `show` throws `IllegalStateException`
before content creation. Null title/content throws `NullPointerException`.
`size`, `title` and `padding` do not change an already-open window.

## GameApp

`public abstract class GameApp extends App`

Extend `zero.GameApp` for animation and canvas input. It has an implicit public
no-argument constructor and inherits all App public methods above.
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
| `protected final void ready(Stage stage)` | Install scene/window input handling, request canvas focus and start the frame timer. |
| `protected final void shutdown()` | Stop the timer if present, clear all input and the image cache, and forget the window. |

Settings, setup, frames and JavaFX handlers run on the JavaFX application thread.
A failed frame stops the timer, clears held input, closes owned audio and reports the exception.
Closing the app also stops its timer.

The readable [App source](src/main/java/zero/App.java) and
[GameApp source](src/main/java/zero/GameApp.java) are the authority for a
locally modified framework. Ordinary JavaFX controls and example classes such as
ScoreDisplay, Player and Question have their own APIs; see the
[app guide](APP-GUIDE.md) for their use.

The source starter includes JavaFX controls, graphics and media. Use `loadSound` for effects and `loadMusic` for tracks; see the
[app guide](APP-GUIDE.md#short-sound-effects). Raw JavaFX AudioClip/MediaPlayer
remain available. Persistence, FXML and web need their own dependencies.
ZeroHub provides exact-version shared libraries through ordinary Java imports;
it does not change this core API or require a component base class. Public managed library admission remains gated; local checks and pinned
consumption do not establish public acceptance.
