# Building apps with Zero

For the complete list of Zero methods, see the [API reference](API.md).

Normal Run builds and opens a native JavaFX window. Publishing for the browser
checks the supported Java/JavaFX subset; some native methods are outside that
subset. For the run/stop flow and browser compatibility, see
[running and browser compatibility](https://zero.codepet.ca/docs/setup#edit-and-run).


Learn step by step through the [tutorials](lessons/00-hello-world.md).
This source guide remains available for older kits and contributor reference;
the [API reference](API.md) is the canonical method lookup. The tutorials introduce
the small set you need for each project:

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

## Zero UI: one view in an app or game

The current local source adds `zero.ui.Label`, `Button`, `Column` and `Element`,
plus `zero.Color` for canvas colours. These additions are unreleased; older kits
keep their bundled APIs. Existing JavaFX examples and controls still work.
These components provide text, button actions and vertical composition. GameApp
also provides explicit gameplay navigation and pause methods.

A reusable display can be an ordinary class with a view and an explicit setter.
Save this as `ScoreDisplay.java` beside Main; the same class works in an App or
GameApp. The maintained [shared ScoreDisplay source](../framework/prototypes/shared/ScoreDisplay.java)
is copied unchanged into the two small [counter](../framework/prototypes/counter/Main.java)
and [coin game](../framework/prototypes/coin-game/Main.java) consumers.

```java
import zero.ui.Element;
import zero.ui.Label;

public class ScoreDisplay {
    private final Label label = new Label("Score: 0");

    public Element view() {
        return label;
    }

    public void setScore(int score) {
        label.setText("Score: " + score);
    }
}
```

In an App, compose views with Column and pass the result to show. In this small
Main, `onClick` receives an ordinary Runnable action: the lambda runs when the
button is activated. Each call replaces the previous callback.

```java
import zero.App;
import zero.ui.Button;
import zero.ui.Column;

public class Main extends App {
    private final ScoreDisplay score = new ScoreDisplay();
    private int count;

    @Override
    public void settings() {
        title("Counter");
        size(320, 220);
        padding(16);
    }

    @Override
    public void setup() {
        Button add = new Button("Add one");
        add.onClick(() -> {
            count++;
            score.setScore(count);
        });
        show(new Column(12, score.view(), add));
    }

    public static void main(String[] args) { launch(args); }
}
```

For a GameApp, keep a ScoreDisplay field and attach it in setup with
`controls(new Column(score.view(), restartButton))`, where restartButton is a
Zero Button. This mounts a bottom HUD while the canvas and explicit update/draw
loop keep running. Change the display with `score.setScore(points)` when your
own game state changes. Use `import zero.Color;` with `background(Color.WHITE)`
and `fill(Color.GOLD)`, or make a colour with `Color.rgb(80, 120, 200)`; channels
are integers from 0 through 255. Keep collision, scoring, reset and pause rules
in your own Java methods.

Column uses 8-pixel spacing by default, or the finite non-negative spacing you
supply; getSpacing/setSpacing read/change that gap. Its children are chosen only
in the constructor. Each element can belong to one parent; use fresh elements
for a new composition. Null text, children or actions throw NullPointerException.
Duplicate children, children already attached to a parent or scene, and invalid
spacing throw IllegalArgumentException before attachment changes. controls
rejects a panel owned elsewhere; mounting the current bottom panel again is safe.
Call show/controls in setup or later callbacks, after content creation, or an
IllegalStateException is thrown.

App.show(Element) replaces centre content and is inherited by GameApp. On a game,
show navigates away from the retained canvas/HUD and suspends gameplay update,
draw and canvas input. Call showGame() to return; use controls for a live HUD.
Keep screen choices, resets and pause rules explicit in Main.

For advanced interoperability, Element exposes the actual JavaFX node through
`fxNode()`. A custom subclass can call the protected `Element(Node)` constructor
with a non-null backing node, while ordinary reusable classes can simply return
an Element as ScoreDisplay does. The bridge preserves JavaFX thread and ownership
rules; use it only when you need native capabilities. Existing JavaFX Color
and drawing overloads remain available. Import one Color class by its short name
and qualify the other if you need both. See the [Zero UI API](API.md#zerouielement)
and [Zero colour API](API.md#color) for signatures and errors.

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
| `void update(double seconds)` | Called before draw while gameplay is visible and not explicitly paused. Change your state and explicitly update your objects. |
| `void draw()` | Called while gameplay is visible, including during explicit pause. Draw the current state. |

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
navigates away from the retained sketch layout and suspends update, draw and
canvas input. Call showGame() to return to the same canvas and HUD.

### Title, pause and results views

Use ordinary Java classes for a game's title, help, pause and results views.
Each can build a Column and return it as an Element. Keep their button actions
as Runnable callbacks supplied by Main, which owns the game state. A class named
TitleScreen is your class; there is no framework `zero.Screen` type or automatic
screen lifetime hook yet.

For example, save this small reusable title view as `TitleScreen.java`:

```java
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Element;
import zero.ui.Label;

public class TitleScreen {
    public Element view(Runnable play) {
        Button start = new Button("Play");
        start.onClick(play);
        return new Column(12, new Label("Coin game"), start);
    }
}
```

In GameApp.setup, first create the actors and attach your HUD with controls.
Then `show(new TitleScreen().view(this::showGame))` displays the title. Its Play
button returns to the retained canvas/HUD without rebuilding your game objects.
Use a callback such as `this::startNewGame` instead when you need to reset state
before calling showGame.

For an explicit pause, call `pause()` from your Pause button. While gameplay is
visible, draw continues, update stops, and native buttons still work. A pause view
can call `show(pauseView)` after pause; its Resume button calls `resume()` followed
by `showGame()`. isPaused reports the explicit pause flag. Navigating away also
suspends gameplay callbacks, but is separate from that flag: showGame preserves
an explicit pause. Calling resume while another view is visible does not navigate.

Main decides when to show results and what Replay resets. For example, after a
win, `show(resultsView)` suspends gameplay. Replay can reset actors, score and
level time, then call resume and showGame. A Title button can show a fresh title
view. Use fresh view elements when composing a new Column; existing elements must
not be attached to two parents.

A navigation request inside update/draw commits after that frame's successful draw;
the last request wins and a failed frame or app stop discards it.
A request from an idle button callback commits immediately. Leaving gameplay
and pause/resume clear held and edge input. Returning with showGame or calling
resume resets elapsed time; the next update receives 0 seconds. Thus returning does not apply the time
spent reading help as one movement step. Music remains your responsibility: call
music.pause()/play() as appropriate. These methods require setup or later and
throw IllegalStateException before the game layout exists or after the app stops.

The local [COIN QUEST example](../framework/prototypes/coin-game/Main.java) puts
this together with an explicit Phase enum in Main. Its title has Play and How to
play; help returns with Back. The game has two levels of three coins, a pointer
controlled player and a 30-active-second challenge per level that starts on the
first pointer movement. Its HUD combines the unchanged ScoreDisplay with level,
time, Pause and Restart game controls. Pause offers Resume, Restart game and
Title screen. Results show You win! or Time's up!, the final score out of six,
Play again and Title screen. Main owns phase, score, level, timing and resets;
the framework owns gameplay suspension and input/elapsed-time clearing.
TitleScreen, HelpScreen, PauseScreen and ResultsScreen are ordinary component
classes returning Element, with no framework base class.

See the [game-flow API](API.md#game-flow). Existing installed kits retain their
bundled behavior; this source addition is unreleased.

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

### Drawing your own Actor

The current local source lets a class extend `zero.Actor` and draw itself using
Zero methods. This is an unreleased addition; existing kits keep their bundled
API. Main still owns its objects and explicitly draws and updates them.

Save each public class in its matching file. These two classes use only Zero
imports and need no image files:

```java
// Player.java
import zero.Actor;
import zero.Color;

public class Player extends Actor {
    public Player(double x, double y) {
        super(x, y);
        setSize(44, 44);
    }

    @Override
    public void draw() {
        fill(Color.BLUE);
        circle(0, 0, width());
    }
}
```

```java
// Coin.java
import zero.Actor;
import zero.Color;

public class Coin extends Actor {
    public Coin(double x, double y) {
        super(x, y);
        setSize(24, 24);
    }

    @Override
    public void draw() {
        fill(Color.GOLD);
        circle(0, 0, width());
    }
}
```

In Main, keep ordinary Player/Coin fields, then call `draw(player)` and
`draw(coin)` from GameApp.draw. For example, these members belong inside a Main
class that extends zero.GameApp (import zero.Color):

```java
private Player player = new Player(100, 100);
private Coin coin = new Coin(240, 120);

@Override
public void update(double seconds) {
    player.setPosition(mouseX(), mouseY());
    player.update(seconds);
    coin.update(seconds);
}

@Override
public void draw() {
    background(Color.WHITE);
    draw(player);
    draw(coin);
}
```

Actor's position is its centre. Inside its draw callback, (0, 0) is that centre;
the framework translates and rotates the drawing for this actor, then restores
the app's previous styles/transform even on failure. Main draws in canvas
coordinates; an actor drawn inside another actor callback uses coordinates
relative to that parent's current transform. Each nested draw restores its caller. Rotation 0 faces right and
positive degrees turn clockwise. The Player circle above follows width because
its code explicitly reads width(). setSize does not automatically scale custom
shape coordinates. An actor without artwork starts at logical size 1 × 1 and
its default draw does nothing; an image/animation actor's default draw still
renders its sprite at the actor's size.

Protected helpers such as fill, stroke, circle, rect and text work only during
that actor's active drawing scope. Calling them from a constructor, update or
outside drawing throws IllegalStateException. Store state in your own fields;
request drawing explicitly from Main. Drawing does not advance animation or
register objects. Collision and collection rules remain explicit Java code.

The existing `actor.draw(GameApp app)` entry point remains compatible. Main's
`draw(actor)` calls it, so an older override still runs. The base entry point
opens the local drawing scope and calls the new no-argument draw callback. New
Actor subclasses normally override draw(); a legacy draw(GameApp) override that
skips super is responsible for its own drawing/context use. This does not change
ordinary helper classes that accept a GameApp parameter directly.
See the [Actor API](API.md#actor) for the complete callback/helper contract.

### Moving objects with Actor

`zero.Actor` is an optional local source addition and is unreleased; older kits
keep their bundled API. You can still write your own Player with ordinary fields.
Actor keeps a sprite, centre position, size and facing direction together, so a
subclass can focus on its own rules. It accepts a loaded Image, an ImageRegion or
a SpriteAnimation. Initial size is the image/frame size; `setSize` changes it.

This small example needs `player.png` and `enemy.png` in `src/main/resources`.
Put each public class in its matching file. Hold an arrow key to move the player;
the enemy faces and follows the player, stopping at its centre.

```java
// Player.java
import javafx.scene.image.Image;
import zero.Actor;

public class Player extends Actor {
    public Player(Image image, double x, double y) {
        super(image, x, y);
    }
}
```

```java
// Enemy.java
import javafx.scene.image.Image;
import zero.Actor;

public class Enemy extends Actor {
    private final Actor target;

    public Enemy(Image image, double x, double y, Actor target) {
        super(image, x, y);
        this.target = target;
    }

    @Override
    public void update(double seconds) {
        super.update(seconds);
        moveToward(target.x(), target.y(), 70, seconds);
    }
}
```

```java
// Main.java
import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import zero.GameApp;

public class Main extends GameApp {
    private Player player;
    private Enemy enemy;

    @Override
    public void settings() {
        size(800, 500);
        title("Actor chase");
    }

    @Override
    public void setup() {
        player = new Player(loadImage("/player.png"), 400, 250);
        enemy = new Enemy(loadImage("/enemy.png"), 100, 100, player);
        player.setSize(48, 48);
        enemy.setSize(48, 48);
    }

    @Override
    public void update(double seconds) {
        double dx = 0;
        double dy = 0;
        if (keyDown(KeyCode.LEFT)) dx -= 160 * seconds;
        if (keyDown(KeyCode.RIGHT)) dx += 160 * seconds;
        if (keyDown(KeyCode.UP)) dy -= 160 * seconds;
        if (keyDown(KeyCode.DOWN)) dy += 160 * seconds;
        player.move(dx, dy);
        player.update(seconds);
        enemy.update(seconds);
    }

    @Override
    public void draw() {
        background(Color.WHITE);
        draw(player);
        draw(enemy);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
```

Main owns every update and draw call; creating an actor does not register it with
the app. Rotation 0 faces right, and positive angles turn clockwise. For a ship,
`player.rotate(90 * seconds)` turns it and `player.moveForward(160, seconds)`
moves along its facing direction; negative speed moves backward. `face(x, y)`
turns without moving. `moveToward` turns and moves, stops exactly at its target,
and leaves facing unchanged when already there. The artwork should face right
at rotation 0 to match these directions. This example lets the player leave the
canvas; add your own boundary rules when needed.

For animation, you can use `new Actor(loadAnimation("/walk.png", 4, 2, 8), x, y)`.
Keep calling update explicitly. A subclass that overrides update calls
`super.update(seconds)` so its sprite still animates. Drawing never advances the
clock. Separate animation objects have independent clocks; assigning the same
SpriteAnimation to two actors shares a clock, which advances on each update call.
`setImage` can switch to an Image, region or animation while retaining the actor's
size, centre and rotation; it does not reset the supplied animation.

Use finite numbers, strictly positive sizes and non-negative elapsed seconds.
`moveToward` also needs non-negative speed. Invalid arguments or non-finite
movement results throw IllegalArgumentException without changing the actor;
null references throw NullPointerException. Actor has no collision geometry.
For a simple axis-aligned rectangle, call Collisions using
`actor.x() - actor.width() / 2`, `actor.y() - actor.height() / 2`,
`actor.width()` and `actor.height()`. That rectangle does not rotate with the art.
See the [Actor API](API.md#actor) for every constructor and method.

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
In that draw call, `this` is the running Main object, which extends `GameApp`.
Player receives the same object as the parameter in `draw(GameApp app)` and
calls drawing methods through it, such as `app.circle(x, y, 44)`. Player owns its
position; the app provides the canvas. Player does not need to extend `GameApp`.
See [lesson 8's explanation and example](lessons/08-movement.md#how-player-uses-the-app-to-draw).
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
