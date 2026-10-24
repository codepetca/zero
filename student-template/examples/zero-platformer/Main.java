import zero.Color;
import zero.GameApp;
import zero.Key;
import zero.Sound;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;
import zero.ui.Row;

/** Main owns the level, rules, input, and one explicit update for the player. */
public class Main extends GameApp {
    private enum State { READY, PLAYING, WON, LOST }

    private State state = State.READY;
    private Player player;
    private Platform[] platforms;
    private Coin[] coins;
    private int collected;
    private double elapsed;
    private Sound chime;
    private Label score;
    private Label message;
    private Button pauseButton;

    @Override public void settings() {
        title("Sky Steps — a Zero platformer");
        size(800, 480);
        padding(12);
    }

    @Override public void setup() {
        chime = loadSound("/media-demo/chime.wav");
        chime.setVolume(0.25);
        score = new Label("");
        message = new Label("");
        pauseButton = new Button("Pause");
        pauseButton.onClick(() -> togglePause());
        Button restart = new Button("Restart");
        restart.onClick(() -> startLevel());
        controls(new Column(8,
                new Row(16, score, pauseButton, restart),
                message,
                new Label("A/D or arrows: move   •   Space / W / Up: jump   •   Escape: pause   •   R: restart")));
        resetLevel();

        Button play = new Button("Play Sky Steps");
        play.onClick(() -> startLevel());
        show(new Column(16,
                new Label("SKY STEPS"),
                new Label("Climb the floating islands. Collect all four coins, then reach the green exit."),
                new Label("Move: A/D or Left/Right. Jump: tap Space, W, or Up."),
                new Label("You can jump through platforms from below. Only their tops catch your feet."),
                new Label("Falling into the water ends the run. Restart gives you a fresh level."),
                new Label("Escape or Pause freezes the game. Choose Resume to continue."),
                new Label("Click the game after using a control to return keyboard focus."),
                play));
    }

    private void resetLevel() {
        platforms = new Platform[] {
            new Platform(0, 420, 220, 60),
            new Platform(260, 350, 110, 20),
            new Platform(410, 285, 120, 20),
            new Platform(575, 220, 115, 20),
            new Platform(695, 350, 105, 130)
        };
        player = new Player(60, 402, 800, platforms);
        coins = new Coin[] {
            new Coin(155, 389), new Coin(315, 319),
            new Coin(470, 254), new Coin(632, 189)
        };
        collected = 0;
        elapsed = 0;
        updateScore();
    }

    private void startLevel() {
        resetLevel();
        state = State.PLAYING;
        resume();
        pauseButton.setText("Pause");
        pauseButton.setEnabled(true);
        message.setText("Collect the coins on the four islands, then reach the green flag.");
        showGame();
    }

    private void togglePause() {
        if (state != State.PLAYING) return;
        if (isPaused()) {
            resume();
            pauseButton.setText("Pause");
            message.setText("Keep climbing. All four coins unlock the exit.");
            showGame();
        } else {
            pause();
            pauseButton.setText("Resume");
            message.setText("Paused. Choose Resume to continue, or Restart for a fresh run.");
        }
    }

    @Override public void update(double seconds) {
        if (state == State.READY) return;
        if (keyPressed(Key.R)) { startLevel(); return; }
        if (state != State.PLAYING) return;
        if (keyPressed(Key.ESCAPE)) { togglePause(); return; }

        int horizontal = 0;
        if (keyDown(Key.LEFT) || keyDown(Key.A)) horizontal--;
        if (keyDown(Key.RIGHT) || keyDown(Key.D)) horizontal++;
        boolean jump = keyPressed(Key.SPACE) || keyPressed(Key.W) || keyPressed(Key.UP);
        player.control(horizontal, jump);
        player.update(seconds); // Actor never registers itself or runs its own timer.
        elapsed += seconds;

        if (player.y() - player.height() / 2 > height()) {
            finish(State.LOST);
            return;
        }
        for (Coin coin : coins) {
            if (!coin.isCollected() && coin.touches(player)) {
                coin.collect();
                collected++;
                chime.stop();
                chime.play(); // Only the collection transition plays a sound.
                message.setText(collected == coins.length
                        ? "Exit unlocked! Reach the green flag on the right island."
                        : "Nice jump! Keep climbing for the remaining coins.");
            }
        }
        updateScore();
        if (collected == coins.length && player.touches(735, 296, 45, 54)) {
            finish(State.WON);
        }
    }

    private void updateScore() {
        score.setText("Coins: " + collected + " / 4     Time: " + (int) elapsed + " s");
    }

    private void finish(State result) {
        state = result;
        pauseButton.setEnabled(false);
        message.setText(result == State.WON
                ? "You reached the exit! Choose Restart or press R to play again."
                : "Splash! Choose Restart or press R to try again.");
    }

    @Override public void draw() {
        background(Color.rgb(219, 239, 246));
        fill(Color.rgb(251, 208, 117));
        circle(710, 80, 92);
        fill(Color.WHITE);
        cloud(100, 100);
        cloud(385, 70);
        cloud(530, 140);
        fill(Color.rgb(73, 155, 193));
        rect(0, 452, width(), 28);
        stroke(Color.rgb(156, 220, 235));
        strokeWidth(2);
        for (int x = 0; x < 800; x += 32) line(x, 461, x + 18, 461);

        for (Platform platform : platforms) platform.draw(this);
        drawExit();
        for (Coin coin : coins) coin.draw(this);
        draw(player); // Calls Player.draw() in coordinates relative to its centre.
        fill(Color.rgb(32, 66, 87));
        textSize(20);
        text("SKY STEPS", 22, 32);
        textSize(14);
        text("Four coins. One brave climb.", 22, 53);

        if (isPaused()) drawBanner("PAUSED", "Choose Resume below to continue.");
        if (state == State.WON) drawBanner("YOU MADE IT!", "All four coins • " + (int) elapsed + " seconds • R to restart");
        if (state == State.LOST) drawBanner("SPLASH!", "Every climb is practice. Press R or choose Restart.");
    }

    private void cloud(double x, double y) {
        circle(x, y, 38);
        circle(x + 25, y - 12, 48);
        circle(x + 52, y, 38);
        rect(x, y, 52, 18);
    }

    private void drawExit() {
        fill(Color.rgb(32, 66, 87));
        rect(755, 294, 4, 56);
        fill(collected == coins.length ? Color.rgb(49, 153, 109) : Color.rgb(135, 151, 154));
        rect(759, 294, 25, 20);
        textSize(12);
        text(collected == coins.length ? "EXIT" : "4 COINS", 722, 282);
    }

    private void drawBanner(String heading, String detail) {
        fill(Color.rgb(32, 66, 87));
        rect(95, 150, 610, 135);
        fill(Color.WHITE);
        textSize(32);
        textCentered(heading, 400, 202);
        textSize(18);
        textCentered(detail, 400, 246);
    }

    public static void main(String[] args) { launch(args); }
}
