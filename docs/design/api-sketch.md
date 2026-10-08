# Zero API sketch: build an app, extract a component, reuse it

Original design proposal, 2026-10-08. This document preserves the API sketch
used to guide implementation. The working versions now live in the
[starter](../../student-template/README.md); consult
[PRODUCT.md](../PRODUCT.md) for the current contract and
[VERIFICATION.md](../VERIFICATION.md) for actual check evidence.
The earlier starter's `SimpleApp` was a canvas-based app; the new design separates
ordinary interface apps from animated sketches.

## The learning model

Create objects, arrange them, respond to events, change state, then extract and
reuse useful pieces. Keep ordinary Java classes, fields, constructors and
methods visible. JavaFX supplies controls and layouts; Zero handles startup and
the small amount of repetitive window configuration.

Two entry points share the same startup conventions:

- `SimpleApp`: `settings()` configures the window, `setup()` builds the interface,
  and `show(Node)` displays it. There is no student animation loop.
- `SketchApp`: adds a canvas, drawing/input helpers and the explicit
  `update(seconds)` followed by `draw()` loop. Its canvas dimensions come from
  `size(width, height)`. A later mixed UI/canvas example should prove integration
  before we design a separate embedded sketch API.

The library calls app lifecycle methods. Students explicitly call methods on
their own objects. JavaFX controls handle their own rendering and layout.
Event handlers and animation run on the JavaFX application thread; long-running
work is a later topic because it would otherwise freeze the interface.

The split requires migrating old canvas examples to `SketchApp`. The source
kit makes that change explicit; this is not a binary compatibility promise.

## Example 1: a tiny quiz

Window sketch:

```text
┌──────────────────────────────┐
│ Mini quiz                    │
│                              │
│ What is 6 × 7?               │
│ [ Answer                  ]  │
│ [ Check answer ]             │
│                              │
│ Try again.                   │
│ Score: 0                     │
└──────────────────────────────┘
```

Begin with one question so the first lesson concerns input, events, state and
objects. Arrays and multiple questions can extend the app afterward.
Only the event-wiring expression is unfamiliar syntax; teach it as “when this
button is clicked, call this method.” The method body stays ordinary Java.

### Main.java

```java
import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    private int points = 0;
    private TextField answer;
    private Label feedback;
    private Button check;
    private ScoreDisplay score;

    @Override
    public void settings() {
        title("Mini quiz");
        size(420, 300);
    }

    @Override
    public void setup() {
        Label question = new Label("What is 6 × 7?");
        answer = new TextField();
        answer.setPromptText("Answer");
        check = new Button("Check answer");
        feedback = new Label("Enter an answer.");
        score = new ScoreDisplay();

        check.setOnAction(event -> checkAnswer());

        VBox screen = new VBox(12,
                question, answer, check, feedback, score.view());
        screen.setPadding(new Insets(20));
        show(screen);
    }

    private void checkAnswer() {
        if (answer.getText().trim().equals("42")) {
            points += 10;
            score.setScore(points);
            feedback.setText("Correct!");
            check.setDisable(true);
        } else {
            feedback.setText("Try again.");
        }
    }

    public static void main(String[] args) {
        launch(args);
    }
}
```

Design observation: this uses real JavaFX controls rather than parallel Zero
versions of buttons, labels and text fields. `show(screen)` is the sole new
interface helper in this example. `size` means initial window content size here;
normal layouts should accommodate resizing. The quiz comparison deliberately
uses a string; parsing numeric input and reporting invalid numbers is a later
exercise.

## The extracted component: ScoreDisplay.java

Start the first quiz with an ordinary score Label directly in Main. Extract this
class when a second app needs a score display. The class contains a JavaFX
object and exposes a useful operation. It needs no Zero component base class,
registration, automatic update method or annotation.

```java
import javafx.scene.Node;
import javafx.scene.control.Label;

public class ScoreDisplay {
    private final Label label;

    public ScoreDisplay() {
        label = new Label("Score: 0");
    }

    public void setScore(int points) {
        label.setText("Score: " + points);
    }

    public Node view() {
        return label;
    }
}
```

Main owns the points and scoring rules; ScoreDisplay owns their presentation.
`view()` is a suggested convention for visual components, not a required method
on every reusable class. Each screen creates its own ScoreDisplay instance;
reuse the class, since a JavaFX node cannot belong to two parents simultaneously.

For now, keep Main and ScoreDisplay together in the starter source folder. Named
packages are a later lesson. For example, students can move the component into
`classroom.components` and import it without changing the overall model.

## Example 2: an animated app with an ordinary object

Window sketch: a circle follows the mouse on a light background. The app decides
when the Player updates and draws. Player has no automatic engine lifecycle.

### Main.java

```java
import javafx.scene.paint.Color;
import zero.SketchApp;

public class Main extends SketchApp {
    private Player player;

    @Override
    public void settings() {
        title("Follow the mouse");
        size(640, 400);
    }

    @Override
    public void setup() {
        player = new Player(320, 200);
    }

    @Override
    public void update(double seconds) {
        player.update(mouseX(), mouseY(), seconds);
    }

    @Override
    public void draw() {
        background(Color.WHITESMOKE);
        player.draw(this);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
```

### Player.java

```java
import javafx.scene.paint.Color;
import zero.SketchApp;

public class Player {
    private double x;
    private double y;

    public Player(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public void update(double targetX, double targetY, double seconds) {
        double amount = Math.min(1, seconds * 5);
        x += (targetX - x) * amount;
        y += (targetY - y) * amount;
    }

    public void draw(SketchApp app) {
        app.fill(Color.ROYALBLUE);
        app.circle(x, y, 40);
    }
}
```

The movement formula is a supplied example, not a prerequisite for learning
objects. Students can first replace it with `x = targetX; y = targetY;`, then
investigate smooth movement and elapsed time. A later interface could decouple
Player's drawing from SketchApp, but that abstraction is not necessary initially.

## Example 3: a second app reusing ScoreDisplay unchanged

Window sketch:

```text
┌──────────────────────────────┐
│ Practice tracker             │
│                              │
│ Score: 0                     │
│ [ Completed an exercise ]    │
│ [ Reset ]                    │
└──────────────────────────────┘
```

### Main.java

```java
import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    private int completed = 0;
    private ScoreDisplay score;

    @Override
    public void settings() {
        title("Practice tracker");
        size(420, 240);
    }

    @Override
    public void setup() {
        score = new ScoreDisplay();
        Button add = new Button("Completed an exercise");
        Button reset = new Button("Reset");
        add.setOnAction(event -> completeExercise());
        reset.setOnAction(event -> resetProgress());

        VBox screen = new VBox(12, score.view(), add, reset);
        screen.setPadding(new Insets(20));
        show(screen);
    }

    private void completeExercise() {
        completed++;
        score.setScore(completed);
    }

    private void resetProgress() {
        completed = 0;
        score.setScore(completed);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
```

This reveals a real reuse issue: “Score” is appropriate for the quiz, but
“Completed” would describe this app better. The first student contribution can
add a constructor accepting a caption, while retaining the no-argument
constructor so the quiz continues to work. Refactoring ScoreDisplay into a
more generally named NumberDisplay can be considered after that experience.
Change the shared class once, then verify both apps.

## Smallest API suggested by the examples

| Surface | Initial contract |
| --- | --- |
| SimpleApp | settings, setup, title, initial size, show a JavaFX Node |
| SketchApp | Common startup plus canvas dimensions, update(seconds), draw |
| Drawing | background, fill, circle, rect, line, text, basic image support |
| Input | Canvas mouse coordinates and held key/button queries |
| Controls and layout | Existing JavaFX Button, Label, TextField, VBox, HBox |
| Events | Existing JavaFX handlers calling ordinary student methods |
| Reusable pieces | Ordinary Java classes; optional view() convention |
| Advanced access | Standard JavaFX nodes/graphics, packages and libraries |

Specify coordinate conventions, window-versus-canvas dimensions, focus behavior,
resource paths and clear error messages before implementing helpers. The initial
interface app should resize naturally; canvas resizing and mixed UI/input focus
need explicit decisions and an integration example. Avoid detecting overrides
through reflection to decide whether animation should run.

We do not yet need Screen or Component base classes, a router, a scene editor,
a custom signal system, automatic object registration, or mandatory model/view
interfaces. A screen is initially just a layout stored in a local variable.

## MVP acceptance and contribution loop

The existing edit/run/share workflow remains. Add these learning checks:

1. A student can explain which code runs once, on a click, and each frame.
2. They can change a quiz question, scoring rule and layout using ordinary Java.
3. They can change Player behavior and identify its explicit update/draw calls.
4. Another student can reuse ScoreDisplay in a separate app without editing it.
5. A caption enhancement preserves the existing quiz and works in the tracker.
6. Both apps can be run and shared through the same Zero/GitHub workflow, with
   repository links submitted separately in Pika.

Contributions begin as readable examples or helpers. Review, document and verify
them in more than one app before adding them to a shared cohort library. Publish
library versions deliberately so improving a component does not unexpectedly
change existing student projects. Versioned distribution remains future work.

The implementation milestone from this sketch is to separate the startup paths,
add show(Node), supply these examples, then verify layout resizing, control focus,
canvas input and shutdown. GitHub onboarding is a separate part of the MVP.
This historical sketch is not verification evidence; see VERIFICATION.md.
