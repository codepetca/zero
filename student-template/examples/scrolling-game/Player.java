import javafx.scene.image.Image;
import zero.SketchApp;

/** The player stores world coordinates, independent of the camera. */
public class Player {
    private double x;
    private final double y;
    private final double size = 32;

    public Player(double x, double y) { this.x = x; this.y = y; }

    public void update(int horizontal, double seconds, double worldWidth) {
        x += horizontal * 200 * Math.max(0, Math.min(seconds, 0.1));
        x = Math.max(0, Math.min(x, Math.max(0, worldWidth - size)));
    }

    public double x() { return x; }
    public double y() { return y; }
    public double centreX() { return x + size / 2; }
    public double centreY() { return y + size / 2; }

    public boolean touches(double otherX, double otherY, double width, double height) {
        return x + size >= otherX && x <= otherX + width
                && y + size >= otherY && y <= otherY + height;
    }

    public void draw(SketchApp app, Image sprite) { app.image(sprite, x, y, size, size); }
}
