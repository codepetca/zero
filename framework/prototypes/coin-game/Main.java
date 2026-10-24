import zero.Color;
import zero.GameApp;

public class Main extends GameApp {
    private enum Phase { TITLE, HELP, PLAYING, PAUSED, RESULTS }

    private Hud hud;
    private final TitleScreen titleScreen = new TitleScreen(this::startGame, this::showHelp);
    private final HelpScreen helpScreen = new HelpScreen(this::showTitle);
    private Phase phase = Phase.TITLE;
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
        selectScore(new ScoreDisplay());
        showTitle();
    }

    /** Replace only the presentation; rules, canvas and lifecycle stay with Main. */
    public void selectScore(ScoreView score) {
        hud = new Hud(score, this::pauseGame, this::startGame,
                () -> selectScore(new ScoreDisplay()), () -> selectScore(new BarScoreDisplay()));
        hud.update(level, points, remaining);
        controls(hud.view());
    }

    public void showTitle() {
        phase = Phase.TITLE;
        pause();
        show(titleScreen.view());
    }

    public void showHelp() {
        phase = Phase.HELP;
        show(helpScreen.view());
    }

    public void startGame() {
        level = 1;
        points = 0;
        elapsed = 0;
        loadLevel();
        phase = Phase.PLAYING;
        resume();
        showGame();
    }

    private void loadLevel() {
        player = new Player(48, 300);
        coins = level == 1
                ? new Coin[] {new Coin(120, 80), new Coin(320, 260), new Coin(520, 80)}
                : new Coin[] {new Coin(120, 260), new Coin(320, 80), new Coin(520, 260)};
        levelPoints = 0;
        remaining = 30;
        waitForPointer();
        hud.update(level, points, remaining);
    }

    private void waitForPointer() {
        moving = false;
        idlePointerX = mouseX();
        idlePointerY = mouseY();
    }

    public void pauseGame() {
        phase = Phase.PAUSED;
        pause();
        show(new PauseScreen(level, points, (int) Math.ceil(remaining),
                this::resumeGame, this::startGame, this::showTitle).view());
    }

    public void resumeGame() {
        waitForPointer();
        phase = Phase.PLAYING;
        resume();
        showGame();
    }

    private void finish(boolean won) {
        phase = Phase.RESULTS;
        pause();
        show(new ResultsScreen(won, points, elapsed, this::startGame, this::showTitle).view());
    }

    public void update(double seconds) {
        if (phase != Phase.PLAYING) return;
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
        hud.update(level, points, remaining);
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
        text(moving ? "Collect every gold coin!" : "Move your pointer onto the field to begin.", 18, 28);
        for (Coin coin : coins) {
            if (!coin.collected) {
                fill(Color.rgb(224, 166, 21));
                circle(coin.x, coin.y + 3, coin.radius * 2 + 4);
                fill(Color.GOLD);
                circle(coin.x, coin.y, coin.radius * 2);
                fill(Color.WHITE);
                circle(coin.x - 3, coin.y - 3, 5);
            }
        }
        fill(Color.rgb(40, 70, 150));
        circle(player.x, player.y + 3, player.radius * 2 + 3);
        fill(Color.BLUE);
        circle(player.x, player.y, player.radius * 2);
        fill(Color.WHITE);
        circle(player.x - 4, player.y - 3, 5);
        circle(player.x + 4, player.y - 3, 5);
        stroke(Color.rgb(169, 190, 220));
        outlineRect(1, 1, width() - 2, height() - 2);
    }

    public static void main(String[] args) { launch(args); }
}
