import zero.Actor;
import zero.Color;

public class Coin extends Actor {
    private boolean collected;

    public Coin(double x, double y) {
        super(x, y);
        setSize(24, 24);
    }

    public boolean isCollected() { return collected; }
    public void collect() { collected = true; }

    @Override public void draw() {
        if (!collected) {
            fill(Color.GOLD);
            rect(-12, -12, 24, 24);
        }
    }
}
