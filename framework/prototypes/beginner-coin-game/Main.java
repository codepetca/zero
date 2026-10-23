import zero.Color;
import zero.GameApp;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;

public class Main extends GameApp {
    private final Label scoreLabel = new Label("Score: 0");
    private final Label levelLabel = new Label("Level 1 of 2 — collect 3 coins.");
    private final Label timeLabel = new Label("Time left: 30s");
    private boolean playing;
    private Player player;
    private Coin[] coins = new Coin[0];
    private int level;
    private int points;
    private int levelPoints;
    private double remaining;
    private double elapsed;
    private boolean moving;
    private double idlePointerX;
    private double idlePointerY;

    public void settings() {
        title("Coin Quest");
        size(640, 360);
        padding(20);
    }

    public void setup() {
        Button pauseButton = new Button("Pause");
        pauseButton.onClick(() -> pauseGame());

        Button restartButton = new Button("Restart game");
        restartButton.onClick(() -> startGame());

        controls(new Column(6,
                levelLabel, scoreLabel, timeLabel,
                pauseButton, restartButton));
        showTitle();
    }

    public void showTitle() {
        playing = false;
        pause();

        Button playButton = new Button("Play");
        playButton.onClick(() -> startGame());

        Button helpButton = new Button("How to play");
        helpButton.onClick(() -> showHelp());

        show(new Column(14,
                new Label("COIN QUEST"),
                new Label("Two fields. Six coins. Beat the clock."),
                new Label("A small Java game built with Zero."),
                playButton, helpButton));
    }

    public void showHelp() {
        Button backButton = new Button("Back");
        backButton.onClick(() -> showTitle());

        show(new Column(12,
                new Label("How to play"),
                new Label("Move your pointer across the field. The blue player follows it."),
                new Label("Collect three gold coins in each of two levels."),
                new Label("Each level gives you 30 seconds, starting when you first move."),
                new Label("Pause takes a break. Resume keeps your score and remaining time."),
                new Label("After resuming, move your pointer again to continue."),
                backButton));
    }

    public void startGame() {
        level = 1;
        points = 0;
        elapsed = 0;
        loadLevel();
        playing = true;
        resume();
        showGame();
    }

    private void loadLevel() {
        player = new Player(48, 300);
        if (level == 1) {
            coins = new Coin[] {new Coin(120, 80), new Coin(320, 260), new Coin(520, 80)};
        } else {
            coins = new Coin[] {new Coin(120, 260), new Coin(320, 80), new Coin(520, 260)};
        }
        levelPoints = 0;
        remaining = 30;
        waitForPointer();
        updateHud();
    }

    private void waitForPointer() {
        moving = false;
        idlePointerX = mouseX();
        idlePointerY = mouseY();
    }

    public void pauseGame() {
        playing = false;
        pause();

        Button resumeButton = new Button("Resume");
        resumeButton.onClick(() -> resumeGame());
        Button restartButton = new Button("Restart game");
        restartButton.onClick(() -> startGame());
        Button titleButton = new Button("Title screen");
        titleButton.onClick(() -> showTitle());

        show(new Column(12,
                new Label("Paused"),
                new Label("Level " + level + " of 2"),
                new Label("Score: " + points + " / 6"),
                new Label("Time left: " + (int) Math.ceil(remaining) + "s"),
                resumeButton, restartButton, titleButton));
    }

    public void resumeGame() {
        waitForPointer();
        playing = true;
        resume();
        showGame();
    }

    private void finish(boolean won) {
        playing = false;
        pause();

        String heading = "Time's up!";
        String advice = "Try a shorter route between the coins.";
        if (won) {
            heading = "You win!";
            advice = "Every coin collected. Ready for another run?";
        }

        Button againButton = new Button("Play again");
        againButton.onClick(() -> startGame());
        Button titleButton = new Button("Title screen");
        titleButton.onClick(() -> showTitle());

        show(new Column(14,
                new Label(heading),
                new Label("Final score: " + points + " / 6"),
                new Label("Playing time: " + (int) Math.ceil(elapsed) + "s"),
                new Label(advice),
                againButton, titleButton));
    }

    private void updateHud() {
        scoreLabel.setText("Score: " + points);
        levelLabel.setText("Level " + level + " of 2 — collect 3 coins.");
        timeLabel.setText("Time left: " + (int) Math.ceil(remaining) + "s");
    }

    public void update(double seconds) {
        if (!playing) return;
        if (mouseX() != idlePointerX || mouseY() != idlePointerY) moving = true;
        if (!moving) return;

        remaining = Math.max(0, remaining - seconds);
        elapsed += seconds;
        if (remaining == 0) {
            finish(false);
            return;
        }

        player.moveToward(mouseX(), mouseY(), seconds);
        for (Coin coin : coins) {
            if (coin.collectIfTouching(player)) {
                points++;
                levelPoints++;
            }
        }
        updateHud();
        if (levelPoints == coins.length) {
            if (level == 1) {
                level = 2;
                loadLevel();
            } else {
                finish(true);
            }
        }
    }

    public void draw() {
        background(Color.rgb(239, 246, 255));
        stroke(Color.rgb(219, 230, 245));
        strokeWidth(1);
        for (int x = 0; x < width(); x += 40) line(x, 0, x, height());
        for (int y = 0; y < height(); y += 40) line(0, y, width(), y);

        fill(Color.rgb(80, 100, 130));
        textSize(15);
        if (moving) {
            text("Collect every gold coin!", 18, 28);
        } else {
            text("Move your pointer onto the field to begin.", 18, 28);
        }
        for (Coin coin : coins) {
            draw(coin);
        }
        draw(player);
        stroke(Color.rgb(169, 190, 220));
        outlineRect(1, 1, width() - 2, height() - 2);
    }

    public static void main(String[] args) { launch(args); }
}
