import zero.Key;
import zero.Color;
import zero.GameApp;

/** Main reads input, then explicitly updates and draws its Player. */
public class Main extends GameApp {
    private Player player;

    @Override public void settings() {
        padding(20);
        size(640, 400);
    }

    @Override public void setup() {
        player = new Player(40, 180);
    }

    @Override public void update(double seconds) {
        int horizontal = 0;
        int vertical = 0;
        if (keyDown(Key.LEFT)) horizontal--;
        if (keyDown(Key.RIGHT)) horizontal++;
        if (keyDown(Key.UP)) vertical--;
        if (keyDown(Key.DOWN)) vertical++;
        player.update(horizontal, vertical, seconds, width(), height());
    }

    @Override public void draw() {
        background(Color.rgb(240, 248, 255));
        fill(Color.rgb(47, 79, 79));
        textSize(20);
        text("Click the canvas, then hold the arrow keys.", 20, 30);
        player.draw(this);
    }

    public static void main(String[] args) { launch(args); }
}
