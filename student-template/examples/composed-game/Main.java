import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import zero.GameApp;

/** Main owns menu/play/win state and explicitly updates ordinary game objects. */
public class Main extends GameApp {
    private Player player;
    private Coin[] coins;
    private int points;
    private boolean won;
    private boolean playing;
    private StartScreen startScreen;
    private Hud hud;

    @Override public void settings() {
        padding(20);
        title("Collect coins with shared views");
        size(640, 400);
    }

    @Override public void setup() {
        startScreen = new StartScreen("Collect the coins",
                "Choose Start, then use the arrow keys to collect all three gold squares. "
                + "The game waits here until you start.", () -> restart());
        startScreen.view().setStyle("-fx-pref-width: 240px;");
        hud = new Hud(() -> restart());
        layout().setLeft(startScreen.view());
        layout().setBottom(hud.view());
        hud.view().setDisable(true);
        hud.setMessage("Choose Start to begin collecting coins.");
        resetObjects();
    }

    private void resetObjects() {
        player = new Player(40, 180);
        coins = new Coin[] {
            new Coin(220, 180), new Coin(420, 80), new Coin(540, 300)
        };
        points = 0;
        won = false;
        hud.setScore(points);
    }

    public void restart() {
        resetObjects();
        playing = true;
        layout().setLeft(null);
        hud.view().setDisable(false);
        hud.setMessage("Collect all " + coins.length + " gold squares. Click the canvas if the arrows do not move you.");
        canvas().requestFocus();
    }

    @Override public void update(double seconds) {
        if (!playing || won) return;
        int horizontal = 0;
        int vertical = 0;
        if (keyDown(KeyCode.LEFT)) horizontal--;
        if (keyDown(KeyCode.RIGHT)) horizontal++;
        if (keyDown(KeyCode.UP)) vertical--;
        if (keyDown(KeyCode.DOWN)) vertical++;
        player.update(horizontal, vertical, seconds, width(), height());
        for (Coin coin : coins) {
            if (!coin.isCollected() && coin.touches(player)) {
                coin.collect();
                points++;
                hud.setScore(points);
            }
        }
        if (points == coins.length) {
            won = true;
            playing = false;
            hud.setMessage("You win! Final score: " + points + ". Choose Restart to collect the coins again.");
        }
    }

    @Override public void draw() {
        background(Color.ALICEBLUE);
        fill(Color.DARKSLATEGRAY);
        textSize(20);
        String instruction = "Choose Start to play.";
        if (playing) instruction = "Hold the arrow keys to move.";
        if (won) instruction = "You win! Choose Restart.";
        text(instruction, 20, 30);
        for (Coin coin : coins) coin.draw(this);
        player.draw(this);
    }

    public static void main(String[] args) { launch(args); }
}
