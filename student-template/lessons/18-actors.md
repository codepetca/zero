# Coin game revisited: meet Actor

![Coin game illustration](visuals/09.svg)

Turn the player and coins into actors while keeping the score, winning and Restart.

Open your existing Coin game project. First **Commit & push** your work, then
create a new branch called `actor-refactor`. This lesson needs a project whose
Zero library includes `Actor.touches(Actor)`; an older Coin project may not have
that method yet. Use a project with the matching Actor library before continuing.

This exercise replaces the entire contents of `Main.java`, `Player.java` and
`Coin.java` with a small working game. It keeps movement, three coins, scoring,
winning and Restart, but resets the canvas to 640 × 360 and uses arrow keys and
a plain score label. The earlier `PlayerInput`, `ScoreDisplay`, badge, optional
WASD, artwork, sound and scrolling are not used by this version. Their other
files remain in your project. Your committed original stays on main; after the
exercise, use it as a reference to bring back any features you want.

## 1. Give Player an Actor

Replace `java/Player.java` with this class. `extends Actor` gives Player a centre,
size, movement and drawing helpers. `super(x, y)` sets its centre; `setSize`
sets its 24 × 24 hitbox. In `draw`, `(0, 0)` is the centre of the actor, so
`(-12, -12)` starts the square at its top-left corner.

```java
import zero.Actor;
import zero.Color;

public class Player extends Actor {
    public Player(double x, double y) {
        super(x, y);
        setSize(24, 24);
    }

    public void steer(int horizontal, int vertical, double seconds) {
        move(horizontal * 180 * seconds, vertical * 180 * seconds);
        setPosition(Math.max(12, Math.min(x(), 628)), Math.max(12, Math.min(y(), 348)));
    }

    @Override public void draw() {
        fill(Color.rgb(100, 149, 237));
        rect(-12, -12, 24, 24);
    }
}
```

## 2. Give Coin an Actor

Replace `java/Coin.java` with this class. Each coin has its own centre, size and
collection state. A collected coin stops drawing.

```java
import zero.Actor;
import zero.Color;

public class Coin extends Actor {
    private boolean collected;

    public Coin(double x, double y) {
        super(x, y);
        setSize(24, 24);
    }

    public boolean isCollected() { return collected; }
    public void collect() { collected = true; }

    @Override public void draw() {
        if (!collected) {
            fill(Color.GOLD);
            rect(-12, -12, 24, 24);
        }
    }
}
```

## 3. Let Main own the game

Replace `java/Main.java` with this version. `player.touches(coin)` checks the
actors’ size rectangles, including touching edges. Rotation and the drawn shape
are ignored; students can override `touches` for a different rule. The method
only checks contact—Main still collects the coin and updates the score.

Main explicitly updates each actor once per frame and draws each actor once.
After replacing all three files, choose **Run App**, click the canvas and use the
arrow keys. Collect one coin and stay on it: the score should increase only once.
Try Restart during play, collect all three coins, then Restart again. Try changing
an actor’s colour or speed, and save your working changes with **Commit & push**.

```java
import zero.Color;
import zero.GameApp;
import zero.Key;
import zero.ui.Button;
import zero.ui.Label;
import zero.ui.Row;

public class Main extends GameApp {
    private Player player;
    private Coin[] coins;
    private int points;
    private boolean won;
    private Label scoreLabel;
    private Label message;

    @Override public void settings() { size(640, 360); }

    @Override public void setup() {
        scoreLabel = new Label("");
        message = new Label("");
        Button restartButton = new Button("Restart");
        restartButton.onClick(() -> restart());
        controls(new Row(12, scoreLabel, message, restartButton));
        restart();
    }

    public void restart() {
        player = new Player(52, 192);
        coins = new Coin[] { new Coin(232, 192), new Coin(432, 92), new Coin(552, 312) };
        points = 0;
        won = false;
        scoreLabel.setText("Score: 0");
        message.setText("Collect all " + coins.length + " coins.");
        showGame();
    }

    @Override public void update(double seconds) {
        if (won) return;
        int horizontal = (keyDown(Key.RIGHT) ? 1 : 0) - (keyDown(Key.LEFT) ? 1 : 0);
        int vertical = (keyDown(Key.DOWN) ? 1 : 0) - (keyDown(Key.UP) ? 1 : 0);
        player.steer(horizontal, vertical, seconds);
        player.update(seconds);
        for (Coin coin : coins) {
            coin.update(seconds);
            if (!coin.isCollected() && player.touches(coin)) {
                coin.collect();
                points++;
                scoreLabel.setText("Score: " + points);
            }
        }
        if (points == coins.length) {
            won = true;
            message.setText("You win! Choose Restart.");
        }
    }

    @Override public void draw() {
        background(Color.WHITE);
        for (Coin coin : coins) draw(coin);
        draw(player);
    }

    public static void main(String[] args) { launch(args); }
}
```

Actor changes the coordinate convention from the earlier Coin lesson: actor
positions are centres, while the earlier square positions were top-left corners.
The starting centres above add 12 pixels to preserve the earlier starting
positions. The shorter canvas changes the vertical movement limit. The bounds
are rectangles even if you later draw a circle or rotate an actor.

## 4. Save and publish

Review and **Commit & push** your changes. Merge only when you are ready to
replace the version on main, including any earlier features you have not yet
brought back. Use **Merge to main**, then choose **Publish & open app** from the
Run menu. Play the published game and try Restart.
