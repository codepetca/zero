import javafx.scene.paint.Color;
import zero.SimpleApp;

/** This is a Java object, not a framework-managed game entity. */
public class Mover {
    private double x;
    private double y;
    private final double radius = 18;
    private final double speed = 180; // Pixels per second on each axis.

    public Mover(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public void update(int horizontal, int vertical, double seconds,
                       double width, double height) {
        x += horizontal * speed * seconds;
        y += vertical * speed * seconds;
        // Keep the whole circle inside the canvas.
        x = Math.max(radius, Math.min(width - radius, x));
        y = Math.max(radius, Math.min(height - radius, y));
    }

    public void draw(SimpleApp app) {
        app.fill(Color.CORNFLOWERBLUE);
        app.circle(x, y, radius * 2);
    }
}
