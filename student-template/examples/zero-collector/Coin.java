import zero.Actor;
import zero.Color;

/** A coin keeps its own collected flag; Main decides when collection happens. */
public class Coin extends Actor {
    private boolean collected;

    public Coin(double x, double y) {
        super(x, y);
        setSize(20, 20);
    }

    public boolean isCollected() { return collected; }
    public void collect() { collected = true; }

    @Override public void draw() {
        fill(Color.GOLD);
        circle(0, 0, width());
        fill(Color.rgb(105, 69, 12));
        rect(-2, -6, 4, 12);
    }
}
