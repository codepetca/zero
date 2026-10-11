import javafx.scene.paint.Color;
import zero.SketchApp;

/** Each coin can score once; Main owns the total. */
public class Coin {
    private final double x;
    private final double y;
    private boolean collected;

    public Coin(double x, double y) { this.x = x; this.y = y; }
    public boolean isCollected() { return collected; }
    public boolean touches(Player player) { return player.touches(x, y, 20, 20); }
    public void collect() { collected = true; }

    public void draw(SketchApp app) {
        if (collected) return;
        app.fill(Color.GOLD);
        app.rect(x, y, 20, 20);
    }
}
