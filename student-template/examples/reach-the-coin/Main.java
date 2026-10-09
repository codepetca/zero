import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import zero.SketchApp;

/** Move the blue square to the gold square. */
public class Main extends SketchApp {
    private Player player;
    private double coinX = 520;
    private double coinY = 180;
    private double coinSize = 24;
    private boolean won;

    @Override
    public void settings() {
        size(640, 400);
        title("Reach the coin");
    }

    @Override
    public void setup() {
        restart();
    }

    public void restart() {
        player = new Player(40, 180);
        won = false;
    }

    @Override
    public void update(double seconds) {
        if (keyDown(KeyCode.R)) {
            restart();
            return;
        }
        if (won) return;

        int horizontal = 0;
        int vertical = 0;
        if (keyDown(KeyCode.LEFT)) horizontal--;
        if (keyDown(KeyCode.RIGHT)) horizontal++;
        if (keyDown(KeyCode.UP)) vertical--;
        if (keyDown(KeyCode.DOWN)) vertical++;

        // Main explicitly updates its ordinary Player object.
        player.update(horizontal, vertical, seconds, width(), height());
        if (player.touches(coinX, coinY, coinSize)) {
            won = true;
        }
    }

    @Override
    public void draw() {
        background(Color.ALICEBLUE);
        fill(Color.DARKSLATEGRAY);
        textSize(20);
        text("Arrow keys: move     R: restart", 20, 30);
        if (won) {
            text("You win! Press R to play again.", 20, 60);
        }
        fill(Color.GOLD);
        rect(coinX, coinY, coinSize, coinSize);
        player.draw(this);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
