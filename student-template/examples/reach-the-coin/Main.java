import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
import zero.SketchApp;

/** Move the blue square to the gold square. */
public class Main extends SketchApp {
    private Player player;
    private double coinX = 520;
    private double coinY = 180;
    private double coinSize = 24;
    private boolean won;
    private Color backgroundColor = Color.web("#f6f5ff");
    private Color textColor = Color.web("#22213b");
    private Font headingFont = Font.font("System", FontWeight.BOLD, 28);
    private Font bodyFont = Font.font("System", 18);

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
        background(backgroundColor);
        fill(textColor);
        graphics().setFont(headingFont);
        text("Reach the coin", 24, 42);
        graphics().setFont(bodyFont);
        text("Arrow keys: move     R: restart", 24, 74);
        if (won) {
            text("You win! Press R to play again.", 24, 106);
        }
        fill(Color.GOLD);
        rect(coinX, coinY, coinSize, coinSize);
        player.draw(this);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
