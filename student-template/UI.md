# UI and app/game flow

Learn reusable views and screen flow in [lesson 9](lessons/10-components.md#screens-and-app-flow).
This source guide remains available for older kits and contributor reference.

Use the same ordinary JavaFX controls in apps and games. A game can have buttons,
labels and reusable views alongside its drawing canvas.
Use [the appearance guide](STYLE.md) for fonts, spacing, colours and editable CSS.

## One app, two starting points

| What you are building | Base class | Put the interface here |
| --- | --- | --- |
| Form, quiz, counter or study app | `App` | Build a VBox/HBox in setup and call `show(screen)`. |
| Drawing, simulation or game | `GameApp` | Draw in the canvas; add controls with `layout().setBottom(...)`, `setTop(...)`, `setLeft(...)` or `setRight(...)`. |

GameApp **extends App**. Create one Main application, not a App
inside a GameApp. A control or component is an ordinary object in that app.
Keep the canvas in the sketch's centre. Inherited `show(...)` replaces the
visible sketch layout but does not stop its timer; it is not a sketch menu command.

## Create UI once; update its values

In `setup()`, create controls, arrange them and attach actions. A Button action
calls an ordinary method that changes your fields and updates controls.
JavaFX draws its controls automatically. In a game, `update(seconds)` changes
the game and `draw()` draws the canvas; neither should rebuild the button row.

The [Coin Game tutorial](lessons/09-coin-game.md) adds controls in
GameApp.setup(), using this pattern:

```java
score = new Label();
message = new Label();
var restartButton = new Button("Restart");
restartButton.setOnAction(event -> restart());
var controls = new HBox(12, score, message, restartButton);
controls.setPadding(new Insets(12));
layout().setBottom(controls);
```

Its `restart()` method resets the game fields, updates the labels and calls
`canvas().requestFocus()`. This returns keyboard input to the canvas after using
a control. Clicking or typing in other controls does not move the player.
Click the canvas after switching windows. Focus loss clears held input; it does
not automatically pause the game.

These controls are outside the canvas. Canvas text follows any drawing transforms;
native controls do not scroll with a game camera. A UI overlay on top of the canvas
is a later layout exercise; this first pass uses a visible bar beside the game.

## A component is an ordinary reusable class

For UI components, use this small convention:

- Constructor: create its controls and accept useful starting configuration.
- `view()`: return the JavaFX Node the app can place in a layout.
- Public methods: change presentation explicitly, such as `setScore(points)`.

`view()` is a convention, not a Zero callback. No component base class or
registration is needed. Main owns the rules and supplies values. Create a separate
instance for each parent; one JavaFX node can belong to only one parent.

The same [ScoreDisplay](examples/shared/ScoreDisplay.java) works in a study app:

```java
score = new ScoreDisplay();
// Include score.view() in your VBox, then show the VBox.
score.setScore(points);
```

and in the [component lesson](lessons/10-components.md):

```java
score = new ScoreDisplay();
// Include score.view() in the HBox attached to layout().setBottom(...).
score.setScore(points);
```

Create it in setup; call `setScore` after changing points and after resetting.
Follow [Lesson 9](lessons/10-components.md) to extract and reuse the class in the
Coin game without changing its scoring rules.
A drawn object such as Player can instead have ordinary update/draw methods,
which Main calls explicitly. A data helper does not need a visual view.

## Name your program's flow

A start screen and HUD can be ordinary Java classes. The optional
[StartScreen](examples/composition-shared/StartScreen.java) and
[Hud](examples/composition-shared/Hud.java) source examples demonstrate the pattern.
They are not new core APIs or published packages.

```java
startScreen = new StartScreen("My app", "Choose Start.", () -> restart());
hud = new Hud(() -> restart());
hud.setScore(points);
hud.setMessage("Ready!");
```

This is the connection: Main supplies a button action and sends values through
methods. Hud itself contains ScoreDisplay, so components can contain other
components. A whole screen is a reusable view too; it does not launch a second
application. In the study app, Start changes the visible view. In the game,
Start removes the side panel and enables play; the canvas stays mounted and
`playing` explicitly gates updates. Both reuse their existing Hud on Restart.
The game reserves Hud space before the window opens.

To build your own, start with one `view()`, a few explicit value setters and
one supplied action. Try it in a second app before adding more configuration.
ZeroHub supports related self-contained JavaFX widgets in one library, with a preview, API and two checked consumers. See [sharing a library](lessons/11-zerohub.md). Public activation is pending.

Start with ordinary fields and methods rather than a new screen framework.

| Program | Current teaching flow | Main owns |
| --- | --- | --- |
| Study app | Question → check/retry → next question → completion → restart | Question index, points, answered/finished flags |
| Coin game | Playing → win → restart | Player/coins, points and won flag |

Use named actions such as `checkAnswer()`, `nextQuestion()` and `restart()`.
Reset all related state and update existing controls. Disable an unavailable
action rather than letting it score twice or advance after completion.

For a later welcome/menu or results page in App, `show(node)` can replace
its content; it does not remember pages or state for you. For a later game pause,
guard your update logic with an app-owned state. Zero does not pause when you
show another node or switch focus. Start/menu/pause/result helpers are proposals,
not extra APIs required by these tutorials.

## Try the game

1. Run [the Coin game](lessons/09-coin-game.md#4-add-a-native-score-and-restart).
2. Follow [the score display lesson](lessons/10-components.md), then change its
   presentation and check that the game still scores and restarts correctly.

These source examples are local tutorial work until a future kit release. Existing
published installers keep their original bundled files; do not assume an older
kit contains a new example directory. The website can expose complete example
source after an approved website update.
