import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import zero.SimpleApp;

/** Arrow keys move an ordinary object. Main decides when to update it. */
public class Main extends SimpleApp {
    private Mover mover;

    @Override
    public void settings() {
        size(640, 400);
        title("Arrow-key movement");
    }

    @Override
    public void setup() {
        mover = new Mover(width() / 2, height() / 2);
    }

    @Override
    public void update(double seconds) {
        int horizontal = 0;
        int vertical = 0;
        if (keyDown(KeyCode.LEFT)) horizontal--;
        if (keyDown(KeyCode.RIGHT)) horizontal++;
        if (keyDown(KeyCode.UP)) vertical--;
        if (keyDown(KeyCode.DOWN)) vertical++;
        mover.update(horizontal, vertical, seconds, width(), height());
    }

    @Override
    public void draw() {
        background(Color.ALICEBLUE);
        fill(Color.DARKSLATEGRAY);
        textSize(20);
        text("Hold the arrow keys to move.", 20, 30);
        mover.draw(this);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
