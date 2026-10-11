import javafx.scene.paint.Color;
import zero.SketchApp;

/** A solid rectangle described in world coordinates. */
public class Platform {
    public final double x, y, width, height;

    public Platform(double x, double y, double width, double height) {
        this.x = x; this.y = y; this.width = width; this.height = height;
    }

    public void draw(SketchApp app) {
        app.fill(Color.SLATEGRAY);
        app.rect(x, y, width, height);
    }
}
