import zero.Actor;
import zero.Color;

/** Counts explicit updates and draws a local heading mark. */
public final class CounterActor extends Actor {
    private final Color color;
    private int updates;

    public CounterActor(Color color, double x, double y) {
        super(x, y);
        this.color = color;
        setSize(48, 48);
    }

    public int updates() { return updates; }

    @Override protected void onUpdate(double seconds) {
        updates++;
        rotate((seconds % 12) * 30);
    }

    @Override public void draw() {
        fill(color);
        circle(0, 0, width());
        stroke(Color.BLACK);
        strokeWidth(3);
        line(0, 0, width() / 2, 0);
    }
}
