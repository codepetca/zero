import zero.Actor;
import zero.Color;

/** A drone approaches the latest target; disabling it gives a brief opening. */
public class Enemy extends Actor {
    private final double speed;
    private double targetX;
    private double targetY;
    private double disabledFor;

    public Enemy(double x, double y, double speed) {
        super(x, y);
        setSize(28, 28);
        this.speed = speed;
        targetX = x;
        targetY = y;
    }

    public void chase(double x, double y) { targetX = x; targetY = y; }
    public boolean isActive() { return disabledFor == 0; }
    public void disable() { disabledFor = 2.5; }

    @Override protected void onUpdate(double seconds) {
        if (!isActive()) {
            disabledFor = Math.max(0, disabledFor - seconds);
            return;
        }
        moveToward(targetX, targetY, speed, seconds);
    }

    @Override public void draw() {
        fill(isActive() ? Color.rgb(241, 108, 104) : Color.rgb(110, 121, 141));
        circle(0, 0, width());
        fill(Color.rgb(21, 28, 43));
        if (isActive()) {
            rect(5, -5, 8, 10);
        } else {
            rect(-7, -2, 14, 4); // A dash also identifies a disabled drone.
        }
    }
}
