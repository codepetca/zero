import javafx.scene.paint.Color;
import zero.SketchApp;

/** An ordinary Java object: it moves only when Main calls update. */
public class Player {
    private double x;
    private double y;
    private double size = 24;
    private double speed = 180;
    private Color color = Color.web("#6457e8");

    public Player(double startX, double startY) {
        x = startX;
        y = startY;
    }

    public void update(int horizontal, int vertical, double seconds,
                       double canvasWidth, double canvasHeight) {
        x += horizontal * speed * seconds;
        y += vertical * speed * seconds;

        // Keep the whole square inside the canvas.
        x = Math.max(0, Math.min(x, canvasWidth - size));
        y = Math.max(0, Math.min(y, canvasHeight - size));
    }

    public boolean touches(double coinX, double coinY, double coinSize) {
        // The squares touch when their horizontal and vertical ranges meet.
        return x + size >= coinX && x <= coinX + coinSize
                && y + size >= coinY && y <= coinY + coinSize;
    }

    public void draw(SketchApp app) {
        app.fill(color);
        app.rect(x, y, size, size);
    }
}
