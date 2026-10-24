import java.util.ArrayList;
import zero.Actor;
import zero.Color;
import zero.GameApp;
import zero.ImageRegion;
import zero.Key;
import zero.Sound;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;
import zero.ui.Row;

/** Main owns the round, collisions, and each actor's single update call. */
public class Main extends GameApp {
    private enum State { TITLE, PLAYING, PAUSED, WON, LOST }
    private State state = State.TITLE;
    private Player player;
    private Coin[] coins;
    private Enemy[] enemies;
    private final ArrayList<Pulse> pulses = new ArrayList<>();
    private ImageRegion robot;
    private Sound chime;
    private int points;
    private double shotWait;
    private Label health;
    private Label score;
    private Label message;
    private Button pauseButton;

    @Override public void settings() {
        title("Zero Collector");
        size(720, 440);
        padding(16);
    }

    @Override public void setup() {
        robot = loadImageRegion("/media-demo/player.png");
        chime = loadSound("/media-demo/chime.wav");
        chime.setVolume(0.2);
        health = new Label("Health: 3 / 3");
        score = new Label("Coins: 0 / 8");
        message = new Label("Collect all eight coins. Avoid the red drones.");
        pauseButton = new Button("Pause");
        pauseButton.onClick(() -> togglePause());
        Button restartButton = new Button("Restart");
        restartButton.onClick(() -> restart());
        Button helpButton = new Button("Help");
        helpButton.onClick(() -> showTitle());
        controls(new Column(8,
                new Row(16, health, score, pauseButton, restartButton, helpButton), message));
        showTitle();
    }

    private void showTitle() {
        resume();
        state = State.TITLE;
        chime.stop();
        Button play = new Button("Play new round");
        play.onClick(() -> restart());
        show(new Column(16,
                new Label("ZERO COLLECTOR"),
                new Label("Collect all eight gold coins before you lose three health."),
                new Label("Move: arrows or W A S D. Moving turns your robot."),
                new Label("Fire: hold Space in your facing direction."),
                new Label("Or hold a click on the arena to aim and fire at the pointer."),
                new Label("Red drones chase you. Pulses disable them for a short time."),
                new Label("Escape pauses. Choose Resume to continue. R restarts."),
                new Label("Help leaves the round; Play starts a fresh one."), play));
    }

    public void restart() {
        player = new Player(robot, 100, 220);
        coins = new Coin[] {
            new Coin(100, 80), new Coin(280, 80), new Coin(460, 80), new Coin(620, 80),
            new Coin(100, 360), new Coin(280, 360), new Coin(460, 360), new Coin(620, 360)
        };
        enemies = new Enemy[] {
            new Enemy(620, 220, 62), new Enemy(400, 180, 70), new Enemy(400, 280, 78)
        };
        pulses.clear();
        points = 0;
        shotWait = 0;
        state = State.PLAYING;
        pauseButton.setEnabled(true);
        pauseButton.setText("Pause");
        message.setText("Collect eight coins. Space fires; held clicks aim and fire.");
        refreshHud();
        chime.stop();
        resume();
        showGame();
    }

    private void togglePause() {
        if (state == State.PLAYING) {
            state = State.PAUSED;
            pause();
            pauseButton.setText("Resume");
            message.setText("Paused. Choose Resume; Restart begins a new round.");
        } else if (state == State.PAUSED) {
            state = State.PLAYING;
            pauseButton.setText("Pause");
            message.setText("Collect eight coins. Space fires; held clicks aim and fire.");
            resume();
            showGame();
        }
    }

    @Override public void update(double seconds) {
        if (keyPressed(Key.R)) { restart(); return; }
        if (state != State.PLAYING) return;
        if (keyPressed(Key.ESCAPE)) { togglePause(); return; }

        int horizontal = 0;
        int vertical = 0;
        if (keyDown(Key.LEFT) || keyDown(Key.A)) horizontal--;
        if (keyDown(Key.RIGHT) || keyDown(Key.D)) horizontal++;
        if (keyDown(Key.UP) || keyDown(Key.W)) vertical--;
        if (keyDown(Key.DOWN) || keyDown(Key.S)) vertical++;
        player.steer(horizontal, vertical, width(), height());
        player.update(seconds);

        // Only an intentional held click changes the keyboard player's aim.
        if (mouseDown()) player.face(mouseX(), mouseY());
        shotWait = Math.max(0, shotWait - seconds);
        if ((keyDown(Key.SPACE) || mouseDown()) && shotWait == 0) {
            pulses.add(new Pulse(player));
            shotWait = 0.28;
        }
        for (Enemy enemy : enemies) {
            enemy.chase(player.x(), player.y());
            enemy.update(seconds);
        }
        updatePulses(seconds);

        for (Coin coin : coins) {
            if (!coin.isCollected() && touching(player, coin)) {
                coin.collect();
                points++;
                chime.stop();
                chime.play();
            }
        }
        for (Enemy enemy : enemies) {
            if (enemy.isActive() && touching(player, enemy) && player.takeHit()) {
                enemy.disable();
            }
        }
        refreshHud();
        // A fatal hit wins a tie with the last coin: the player must survive.
        if (player.health() == 0) finish(State.LOST);
        else if (points == coins.length) finish(State.WON);
    }

    private void updatePulses(double seconds) {
        for (int i = pulses.size() - 1; i >= 0; i--) {
            Pulse pulse = pulses.get(i);
            pulse.update(seconds);
            for (Enemy enemy : enemies) {
                if (pulse.isActive() && enemy.isActive() && pulse.hits(enemy)) {
                    enemy.disable();
                    pulse.expire();
                }
            }
            if (!pulse.isActive()) pulses.remove(i);
        }
    }

    private boolean touching(Actor first, Actor second) {
        double radius = (first.width() + second.width()) / 2;
        return Math.hypot(first.x() - second.x(), first.y() - second.y()) <= radius;
    }

    private void refreshHud() {
        health.setText("Health: " + player.health() + " / 3");
        score.setText("Coins: " + points + " / " + coins.length);
    }

    private void finish(State result) {
        state = result;
        pauseButton.setEnabled(false);
        message.setText(result == State.WON
                ? "You win! Choose Restart or press R for a new round."
                : "Round over. Choose Restart or press R to try again.");
    }

    @Override public void draw() {
        background(Color.rgb(21, 28, 43));
        stroke(Color.rgb(40, 50, 69));
        strokeWidth(1);
        for (int x = 0; x <= width(); x += 40) line(x, 0, x, height());
        for (int y = 0; y <= height(); y += 40) line(0, y, width(), y);
        for (Coin coin : coins) if (!coin.isCollected()) draw(coin);
        for (Enemy enemy : enemies) draw(enemy);
        for (Pulse pulse : pulses) draw(pulse);
        draw(player);
        if (state == State.PAUSED || state == State.WON || state == State.LOST) {
            fill(Color.rgb(21, 28, 43));
            rect(150, 172, 420, 96);
            fill(Color.WHITE);
            textSize(28);
            textCentered(state == State.PAUSED ? "Paused"
                    : state == State.WON ? "All coins collected!" : "Round over", width() / 2, 211);
            textSize(17);
            textCentered(state == State.PAUSED ? "Choose Resume below."
                    : "Choose Restart or press R.", width() / 2, 244);
        }
    }

    public static void main(String[] args) { launch(args); }
}
