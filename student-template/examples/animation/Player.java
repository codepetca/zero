import javafx.scene.paint.Color;
import zero.SketchApp;

/** An ordinary object. Main explicitly calls update and draw. */
public class Player {
    private double x;
    private double y;

    public Player(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public void update(double targetX, double targetY, double seconds) {
        double amount = Math.min(1, seconds * 5);
        x += (targetX - x) * amount;
        y += (targetY - y) * amount;
    }

    public void draw(SketchApp app) {
        app.fill(Color.web("#4878e8"));
        // Circle positions describe the centre; rectangles use the top-left.
        app.circle(x, y, 44);
    }
}
