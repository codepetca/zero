# Building apps with Zero

For the complete list of Zero methods, see the [API reference](API.md).

Normal Run builds a browser preview and checks the supported Java/JavaFX subset.
Native JavaFX may provide methods that browser builds reject with source
locations. For the run/stop flow and explicit native diagnostic, see
[running and browser compatibility](https://zero.codepet.ca/docs/setup#edit-and-run).


New to Zero? Start with the [beginner toolkit](BEGINNER.md), then
[make it look good](STYLE.md) and [UI and app/game flow](UI.md). This page is the complete reference; you can
learn a small set first:

| Build | Start with |
| --- | --- |
| An app | `App`: `settings()`, `setup()`, `size(...)`, `title(...)`, `padding(...)`, `show(...)`; ordinary `Label`, `Button`, `TextField`, `VBox`, `HBox`. |
| A game | `GameApp`: the same startup, plus `update(seconds)`, `draw()`, `keyDown(...)`, `width()`, `height()`, `background(...)`, `fill(...)`, `rect(...)`, `circle(...)`, `textSize(...)`, `text(...)`. |
| Improve appearance | JavaFX fonts, a few colours, spacing/padding and an editable stylesheet; canvas fonts through `graphics().setFont(...)`. |

Follow the [Greeting App tutorial](lessons/02-hello-name.md) for controls or
the [Coin Game tutorial](lessons/08-movement.md) for a canvas game.

This reference describes the bundled [App source](src/main/java/zero/App.java)
and [GameApp source](src/main/java/zero/GameApp.java). Use these classes for
startup, drawing and input; use ordinary Java for your app's objects and rules.
The source is the authority if you change your local framework.

## Choose an app

Extend `zero.App` for buttons, forms, quizzes and other event-driven
interfaces. Extend `zero.GameApp` for a canvas that updates and draws each frame.
Both are JavaFX applications. Put this entry point in your Main class:

```java
public static void main(String[] args) { launch(args); }
```

`launch` comes from JavaFX `Application`. Normal Run App uses `Main`, as configured
by `app.mainClass` in [pom.xml](pom.xml). See [README.md](README.md) for running
and [EXERCISES.md](EXERCISES.md) for practice.

## App: startup and interfaces

Override these public methods; their default bodies do nothing:

| Signature | When it runs / what to put here |
| --- | --- |
| `void settings()` | Once at startup, before the interface exists. Set the initial size, title and edge padding. |
| `void setup()` | Once after the root exists, before the window is shown. Build your controls and show them. |

These public methods are `final` (call them; do not override them):

| Signature | Behavior |
| --- | --- |
| `void size(double width, double height)` | Set initial content dimensions in pixels, inside `settings()` only. Both numbers must be positive and finite. Default: 800 × 500. |
| `void title(String title)` | Set the window title inside `settings()` only. It must not be null. Default: `"Zero"`. |
| `void padding(double pixels)` | Set space around all four content edges in `settings()`, `setup()` or later JavaFX handlers. The number must be non-negative and finite. Default: 0. GameApp keeps its fixed canvas size. |
| `void show(Node content)` | Replace the root's centre with a non-null JavaFX node. Call in `setup()` or later in an event handler. |

`size` and `title` throw `IllegalStateException` outside settings;
invalid size or padding throws `IllegalArgumentException`. `show` before startup throws
`IllegalStateException`; null title/content is rejected. These methods do not
resize or retitle an already-open window.

```java
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.App;

public class Main extends App {
    private int clicks;

    @Override public void settings() {
        title("Click counter");
        size(360, 220);
        padding(20);
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

App has no animation loop. The window is resizable; native layouts arrange
their children. `show` replaces content; it does not store screens or create a
navigation history. Keep any state you need in your own fields and objects.

No constructor is needed in Main: App and GameApp have implicit public
no-argument constructors, and JavaFX creates your app through `launch(args)`.
Use `settings()` for initial configuration, including `padding(20)` in either
app type. You can also call padding in `setup()` or a JavaFX event handler.
Repeated calls replace the amount; `padding(0)` removes it. In App, padding uses
space inside the configured window dimensions. In GameApp, the initial window
grows to include padding around the fixed canvas and controls, preserving canvas
dimensions and drawing coordinates. Later changes rearrange the existing window.

## Ordinary JavaFX and reusable objects

Useful native starting points include `Label.setText(String)`,
`Button.setOnAction(...)`, `TextField.getText()` and `setPromptText(String)`,
`Node.setDisable(boolean)`, and `VBox`, `HBox` and `BorderPane` layouts.
For example, `new VBox(12, firstNode, secondNode)` uses 12-pixel spacing;
`screen.setPadding(new Insets(20))` adds 20-pixel padding to that specific layout.
Use `padding(20)` for the whole app; using both adds their padding together. Import controls from
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

## GameApp: frames and canvas

GameApp inherits settings, setup, size and title. It creates its canvas before
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
around the canvas. Keep its centre canvas for a sketch. Use App and
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
`loadImage` caches successful loads per app using the canonical resolved resource
URL. Aliases return the same Image; failures are not cached. Images remain in
memory until shutdown clears the cache, so keep your asset set bounded. Load
assets in setup to make their ownership and any errors easy to find.

### Sprite frames and small game helpers

Mac setup 0.5.23 includes these helpers with core 0.2.1. Older downloads keep
their bundled API. Import
`zero.SpriteAnimation`, `zero.ImageRegion` and `zero.Collisions` as needed.

Keep a `SpriteAnimation walk;` field. In setup, load a regular sheet whose four
columns and two rows divide its image dimensions exactly:

```java
walk = loadAnimation("/walk.png", 4, 2, 8);
```

In update, call `walk.update(seconds)` explicitly once. In draw, use:

```java
image(walk, x, y, 64, 64);
imageCentered(walk, 300, 100, 64, 64, 30);
textCentered("Ready", width() / 2, 40);
```

Drawing never advances an animation. Two calls to loadAnimation share the bitmap
but create independent clocks; reset() returns one clock to frame zero. Grid
frames run left to right, then top to bottom. A sheet needs aligned, equal-size
cells without margins or spacing; trim artwork before treating it as a grid.
For irregular atlases, create equal-size source rectangles with
`imageRegion(sheet, x, y, width, height)` and pass them to
`new SpriteAnimation(8, first, second)`. Regions retain the original Image without
copying pixels. Their source bounds must lie inside the loaded image.

`image` accepts an Image, ImageRegion or SpriteAnimation, with natural or scaled
size. `imageCentered` draws around its destination centre with rotation in
degrees; `imageFlippedY` reflects vertically inside a top-left destination
rectangle. Both restore the previous drawing styles and transform. textCentered
centres horizontally while respecting the current font, fill and baseline
convention; the default y remains a baseline.

For a one-time action, test `keyPressed(KeyCode.SPACE)` or
`mousePressed(MouseButton.PRIMARY)` in update. Repeated queries, including queries
in draw, see the same value throughout that frame. Holding does not repeat;
a short press/release between frames still appears in the next frame. Every real
update/draw clears that edge afterward, even if your own game logic is paused.
Canvas/window focus loss clears pending, held and current-frame input.
`windowFocused()` reports window focus even when a native control has focus; it
does not promise canvas focus or pause your game. Main still owns pause rules.

Use `Collisions.circleHitsRect(cx, cy, radius, x, y, width, height)`,
`Collisions.rectHitsRect(...)` or `Collisions.circleHitsCircle(...)` for geometry.
Circles use a radius here; the drawing circle method uses a diameter. Touching
edges count. Coordinates must be finite; dimensions/radii are non-negative and
finite. These predicates leave movement, scoring and collision response in your
own Java objects. The [API reference](API.md) lists every overload and constructor.

### Short sound effects

The starter provides `zero.Sound` for short effects and `zero.Music` for longer
tracks, in both App and GameApp. Mac setup 0.5.23 includes these helpers with
core 0.2.1. Older downloads keep their bundled API. The starter pins JavaFX media. Put `chime.wav` and `music.wav` in `src/main/resources`.
Keep fields and load once in setup:

```java
// Fields (import zero.Sound and zero.Music):
private Sound chime;
private Music music;

@Override
public void setup() {
    chime = loadSound("/chime.wav");
    music = loadMusic("/music.wav");
    music.setVolume(0.4);
    music.loop();
    // Create your controls or other app objects here too.
}
```

Call `chime.play()` for an event such as collecting a coin or pressing a button.
A short effect can overlap itself. Sound volume changes apply to subsequent plays;
muting stops existing effects and silences new plays until unmuted. Loading the same sound resource again returns
the same live Sound, including shared volume/mute settings. Closing it and loading
again returns a fresh one. Effects hold decoded samples in memory; keep them short.
Each `loadMusic` call creates an independent buffered player and playback position.

Main owns game rules: call `music.pause()` when pausing, `music.play()` to resume,
and `music.stop()` to rewind on restart. `loop()` selects repeat mode, which stays
selected through stop/play. `music.setMuted(true)` silences it while preserving
volume; `setMuted(false)` restores that volume. Both helpers accept finite volume
from 0 to 1 and offer `getVolume`, `isMuted`, `isPlaying`, `stop` and `close`.
Playback/readiness are asynchronous, so `isPlaying()` can initially be false.

The app closes owned audio automatically on stop/window close, startup failure
and frame failure. Focus loss does not automatically pause audio or game logic.
Use loaders, controls and close on the JavaFX application thread (setup, update and
JavaFX handlers already run there). `close()` is idempotent; later controls report
that the resource is closed, while getters remain readable. Missing/unreadable
resources give a useful path; asynchronous music failures report that path once
and dispose the player. The [API reference](API.md#audio) lists exact signatures.
Raw JavaFX [AudioClip](https://openjfx.io/javadoc/21/javafx.media/javafx/scene/media/AudioClip.html)
and MediaPlayer remain available for advanced needs; manage those resources yourself.
The older [Lesson 12](lessons/12-media.md) examples demonstrate ordinary AudioClip
and the additional dependency needed by older kits.

### Input methods

Import `KeyCode` and `MouseButton` from `javafx.scene.input`. These public final
methods include held input, frame edges and window focus (see the helper guide above):

| Signature | Result |
| --- | --- |
| `double mouseX()` | Latest tracked mouse x in canvas coordinates. Starts at canvas centre. |
| `double mouseY()` | Latest tracked mouse y in canvas coordinates. Starts at canvas centre. |
| `boolean keyDown(KeyCode key)` | Whether a key pressed while the canvas had focus is held. |
| `boolean mouseDown(MouseButton button)` | Whether a button pressed on the canvas is held. |
| `boolean keyPressed(KeyCode key)` | New press visible for the current update/draw frame. |
| `boolean mousePressed(MouseButton button)` | New button press visible for the current update/draw frame. |
| `boolean windowFocused()` | Whether the app window has focus, including native controls. |

Click the canvas to give it focus. Native text controls receive ordinary typing;
their presses do not become game input. Losing canvas or window focus clears
held keys/buttons. Releasing an owned key/button clears it, including a mouse
release outside the canvas. Mouse coordinates track canvas events and an owned
drag, and can be outside its bounds; they do not continually track movement over
other controls.

This small game makes movement explicit:

```java
import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import zero.GameApp;

public class Main extends GameApp {
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

A startup failure closes the window and runs shutdown; a failed game frame
stops its timer and clears held input, then reports the exception. Closing an app
also stops the game timer. Fix the source and Run App again.

For framework contributors, App exposes protected hooks:
`final double initialWidth()`, `final double initialHeight()`,
`Node createContent()`, `Scene createScene(BorderPane content)`,
`void ready(Stage stage)` and `void shutdown()`. Startup runs settings, creates
the root/content, runs setup, creates the scene, shows the stage, then calls
ready. Its public `final void start(Stage stage)` and `final void stop()` manage
that lifecycle; stop calls shutdown at most once and closes owned audio on every call. GameApp provides final overrides of the
content/scene/ready/shutdown hooks to own its canvas and timer. Students normally
override only settings, setup, update and draw.

Java packages, interfaces, collections and JavaFX properties remain available.
For a packaged class `school.app.Main`, use `package school.app;`, place it in
`src/main/java/school/app/Main.java`, and change `app.mainClass` in pom.xml to
`school.app.Main`. A packaged Main cannot import helpers from Java's unnamed
package; move its helpers into named packages too. Resource-root image paths
such as `/player.png` keep working.

The source starter includes JavaFX controls, graphics and media. Persistence,
FXML and web need their own dependencies. The Sound/Music helpers wrap
JavaFX media; raw AudioClip and MediaPlayer are also available. ZeroHub provides exact-version shared libraries through ordinary Java imports; it does not change this core API or require a component base class. Public managed library admission remains gated; local checks and pinned
consumption do not establish public acceptance.

Try the local [Sprite playground](examples/sprite-playground/README.md) in a fresh project,
copying one example at a time. It shares one bird sheet across two independent
clocks, selects four aligned ImageRegion frames from the atlas, and demonstrates
pause, reset, edge input and collision feedback.

Try the optional [Audio playground](examples/audio-playground/README.md) in a separate
fresh project. Its native buttons demonstrate effect playback, music loop/pause/
resume/stop and mute using one setup-time load per resource.
