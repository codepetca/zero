import zero.Color;
import zero.GameApp;
import zero.ImageRegion;

/** An ordinary object: coordinates change only when update is called. */
public class Player {
    private double x;
    private double y;
    private final double size = 24;
    private final double speed = 180;

    public Player(double startX, double startY) {
        x = startX;
        y = startY;
    }

    public void update(int horizontal, int vertical, double seconds,
                       double canvasWidth, double canvasHeight) {
        x += horizontal * speed * seconds;
        y += vertical * speed * seconds;
        // x and y locate the top-left corner; keep the whole square visible.
        x = Math.max(0, Math.min(x, canvasWidth - size));
        y = Math.max(0, Math.min(y, canvasHeight - size));
    }

    public boolean touches(double coinX, double coinY, double coinSize) {
        // Squares touch when both their horizontal and vertical ranges meet.
        return x + size >= coinX && x <= coinX + coinSize
                && y + size >= coinY && y <= coinY + coinSize;
    }

    public void draw(GameApp app) {
        app.fill(Color.rgb(100, 149, 237));
        app.rect(x, y, size, size);
    }

    public void drawImage(GameApp app, ImageRegion sprite) {
        app.image(sprite, x, y, size, size);
    }
}
