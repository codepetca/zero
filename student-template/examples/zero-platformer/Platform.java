import zero.Color;
import zero.GameApp;

/** Level data plus drawing. Its top catches a descending player; sides are open. */
public class Platform {
    public final double x, y, width, height;

    public Platform(double x, double y, double width, double height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    public void draw(GameApp app) {
        app.fill(Color.rgb(128, 102, 90));
        app.rect(x, y, width, height);
        app.fill(Color.rgb(79, 151, 120));
        app.rect(x, y, width, 7);
        app.fill(Color.rgb(159, 131, 108));
        for (double pebble = x + 12; pebble < x + width - 5; pebble += 25) {
            app.rect(pebble, y + 12, 7, 4);
        }
    }
}
