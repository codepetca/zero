import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import zero.GameApp;

/** Main reads input, then explicitly updates and draws its Player. */
public class Main extends GameApp {
    private Player player;

    @Override public void settings() {
        padding(20);
        title("Move a square");
        size(640, 400);
    }

    @Override public void setup() {
        player = new Player(40, 180);
    }

    @Override public void update(double seconds) {
        int horizontal = 0;
        int vertical = 0;
        if (keyDown(KeyCode.LEFT)) horizontal--;
        if (keyDown(KeyCode.RIGHT)) horizontal++;
        if (keyDown(KeyCode.UP)) vertical--;
        if (keyDown(KeyCode.DOWN)) vertical++;
        player.update(horizontal, vertical, seconds, width(), height());
    }

    @Override public void draw() {
        background(Color.ALICEBLUE);
        fill(Color.DARKSLATEGRAY);
        textSize(20);
        text("Click the canvas, then hold the arrow keys.", 20, 30);
        player.draw(this);
    }

    public static void main(String[] args) { launch(args); }
}
