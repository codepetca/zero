import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import zero.SketchApp;

/** Start here: ordinary Java fields, methods, and objects. */
public class Main extends SketchApp {
    private Player player;

    @Override
    public void settings() {
        size(800, 500);
        title("My Zero App");
    }

    @Override
    public void setup() {
        player = new Player(width() / 2, height() / 2);
    }

    @Override
    public void update(double seconds) {
        // You decide which objects update and what information they need.
        if (keyDown(KeyCode.SPACE)) {
            player.update(width() / 2, height() / 2, seconds);
        } else {
            player.update(mouseX(), mouseY(), seconds);
        }
    }

    @Override
    public void draw() {
        background(Color.web("#f4f7fc"));
        fill(Color.web("#233247"));
        textSize(20);
        text("Move your mouse. Hold Space to pull toward the centre.", 24, 36);
        player.draw(this);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
