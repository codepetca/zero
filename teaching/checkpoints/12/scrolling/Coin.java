import zero.Color;
import zero.GameApp;

/** A coin remembers whether it was collected; Main owns the score. */
public class Coin {
    private final double x;
    private final double y;
    private final double size = 24;
    private boolean collected;

    public Coin(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public boolean isCollected() { return collected; }

    public boolean touches(Player player) { return player.touches(x, y, size); }

    public void collect() { collected = true; }

    public void draw(GameApp app) {
        if (collected) return;
        app.fill(Color.GOLD);
        app.rect(x, y, size, size);
    }

    public void draw(GameApp app, double cameraX) {
        if (collected) return;
        app.fill(Color.GOLD);
        app.rect(x - cameraX, y, size, size);
    }
}
