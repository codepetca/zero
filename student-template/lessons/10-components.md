# 10. Reuse the score display

**First checkpoint: one class works in two projects you already wrote.**

![One ScoreDisplay class copied between the study quiz and Coin game, with a separate instance in each](visuals/10.svg)

Reopen your **Study quiz** from lesson 7 and your **Coin game** from lesson 9. These are your two existing tutorial repositories; lesson 10 has no starter download.

Previous: [Build a coin game](09-coin-game.md).

## 1. Extract the display from your study quiz

Open the `src/main/java/Main.java` you wrote in lesson 7. Main owns `points`, and its `refreshStats()` currently sets `scoreLabel.setText("Score: " + points);`. Create `src/main/java/ScoreDisplay.java` in that **study** folder:

```java
import zero.ui.Element;
import zero.ui.Label;

public class ScoreDisplay {
    private final Label label = new Label("Score: 0");

    public void setScore(int points) {
        label.setText("Score: " + points);
    }

    public Element view() {
        return label;
    }
}
```

## 2. Replace the study Main display calls

In study Main, change the field `private Label scoreLabel;` to `private ScoreDisplay score;`. In `setup()`, replace `scoreLabel = new Label("");` with `score = new ScoreDisplay();` and place `score.view()` in the existing `Column` where `scoreLabel` was. In `refreshStats()`, replace `scoreLabel.setText("Score: " + points);` with `score.setScore(points);`. Keep `points`, question rules, `Counter`, and Restart in Main.

## 3. Run App and test the study quiz

Run App: a wrong answer leaves score 0; answer `5` for the first question to reach 1; Restart returns to 0. The quiz has more questions; finish and restart it again.

Each `new ScoreDisplay()` creates one Label through the field initializer. Java supplies the no-argument constructor because you have not written another constructor. `view()` returns an Element that Main can place in a Column or Row. Label is an Element; ScoreDisplay remains an ordinary class. `setScore(int)` changes the label explicitly. No framework registration, component subclass or hidden update is involved.

## 4. Use the same class in your Coin game

Copy **your own** `ScoreDisplay.java` from the study folder into your existing Coin game's `src/main/java/`. Do not copy a new Main or Player. In the game's Main, change `private Label scoreLabel;` to `private ScoreDisplay score;`. In `setup()`, use `score = new ScoreDisplay();` and replace `scoreLabel` in the existing `Row` with `score.view()`. In `restart()` and after `points++`, change each score-label update to `score.setScore(points);`. Keep that reset call after setting `points = 0`, and keep `showGame()` at the end of Restart.

## 5. Run App and test the Coin game

Leave the message Label and game rules in Main. Run App: collect a coin and stay on it (`Score: 1`), Restart during play (`Score: 0`), collect all three (`Score: 3`), then Restart after winning. Each running app has its own ScoreDisplay object and Zero Label. An Element belongs to one parent, so you reuse the **class source**, not one live Label across windows.

## 6. Improve one class, then check both uses

Try changing the displayed word from Score to Points. In ScoreDisplay, change both the label initializer and setScore text:

```java
private final Label label = new Label("Points: 0");

public void setScore(int points) {
    label.setText("Points: " + points);
}
```

Copy that one changed class into the other project. Leave Main's score and rules alone.

## 7. Run both apps and check the shared change

Run both. Each now says Points, while scoring and Restart still work. If one project still looks unchanged, check which copy of `ScoreDisplay.java` you edited and rerun that project. **Restore Score in both the initializer and setScore, then copy the restored class to the other project before lesson 11.** After writing your own code, compare the [study Main](../../teaching/checkpoints/10/study/Main.java), [game Main](../../teaching/checkpoints/10/game/Main.java) and their identical [ScoreDisplay.java](../../teaching/checkpoints/10/study/ScoreDisplay.java).

ScoreDisplay owns presentation; each Main owns its score and rules. In [lesson 11](11-zerohub.md), use this boundary to evaluate a component locally before sharing original work.

### Reusable views

`view()` is your convention, not a Zero callback. A component can create its
controls in its constructor or field initializers, return an `Element` through `view()`, and
expose a few methods such as `setScore(...)`. Main creates it once in setup,
places its view, then sends new values explicitly after state changes.

Reuse the class in another layout by creating a separate instance: one live
Element can belong to only one parent. A component may contain other components;
a HUD can include a ScoreDisplay and a message Label. Main still owns points,
win flags and actions such as `restart()`. If a component contains a button,
Main can supply its action through the constructor, for example a `Runnable`
parameter passed to `button.onClick(onRestart)`.

Player uses a different useful convention: Main calls its `update(...)` and
`draw(GameApp app)` methods. A Question holds data and checks an answer. Neither
needs a `view()` unless it actually provides UI elements. These are ordinary
classes with methods chosen for their jobs.

### Screens and app flow

Keep one running Main application. GameApp already extends App; a screen or HUD
is an object inside that application, not another App to launch.

For a later study-app welcome or result screen, an ordinary class can build a
layout and return it from `view()`. Main can call `show(startScreen.view())`
and later `show(quizScreen.view())` in an action. `show(...)` replaces App's
visible content; Main must keep the question index, score and current-screen
state itself. Use named methods such as `checkAnswer()`, `nextQuestion()` and
`restart()` to change state and refresh existing controls. Disable actions that
would score an answer twice or advance beyond the final question.

In GameApp, mount a live HUD with `controls(new Row(...))` or a Column. Build
controls once in setup rather than rebuilding them each frame. Updating those
controls keeps the canvas, updates and drawing active. Showing another UI view
with `show(...)` instead suspends gameplay updates, drawing and canvas input.
`showGame()` returns to the retained game and HUD, clearing old input and elapsed
time; an explicitly paused game stays paused until `resume()`. Main still owns
score, level and playing rules. Changing levels can replace ordinary game objects
without navigating away or creating another application.

A drawn screen can instead define `draw(GameApp app)`. Main calls
`gameScreen.draw(this)` from its draw method. If that screen owns a Player, it
can call `player.draw(app)` inside its own method, passing the same reference
onward. As in [lesson 8](08-movement.md#how-player-uses-the-app-to-draw), both draw
onto the existing canvas; neither creates another application. Keep state changes
in explicit actions or update methods rather than hiding them in drawing.
