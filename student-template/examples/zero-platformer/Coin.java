import zero.Color;
import zero.GameApp;

/** Each coin changes state once. Main owns the score and sound. */
public class Coin {
    private final double x, y;
    private boolean collected;

    public Coin(double x, double y) { this.x = x; this.y = y; }
    public boolean isCollected() { return collected; }
    public void collect() { collected = true; }

    public boolean touches(Player player) {
        return player.touches(x - 10, y - 10, 20, 20);
    }

    public void draw(GameApp app) {
        if (collected) return;
        app.fill(Color.rgb(212, 151, 36));
        app.circle(x, y, 22);
        app.fill(Color.rgb(255, 219, 107));
        app.circle(x, y - 1, 16);
        app.fill(Color.rgb(212, 151, 36));
        app.rect(x - 2, y - 6, 4, 10);
    }
}
