import javafx.scene.paint.Color;
import zero.GameApp;

/** A patrol moves only when Main calls update. */
public class Enemy {
    private double x;
    private final double y, left, right;
    private int direction = 1;

    public Enemy(double left, double right, double y) {
        this.left = left; this.right = right; this.y = y; x = left;
    }

    public void update(double seconds) {
        x += direction * 70 * seconds;
        if (x >= right) { x = right; direction = -1; }
        if (x <= left) { x = left; direction = 1; }
    }

    public boolean touches(Player player) { return player.touches(x, y, 28, 28); }
    public double x() { return x; }

    public void draw(GameApp app) {
        app.fill(Color.FIREBRICK);
        app.rect(x, y, 28, 28);
    }
}
