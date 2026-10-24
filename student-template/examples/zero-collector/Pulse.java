import zero.Actor;
import zero.Color;

/** A short-lived shot remembers its path so it cannot jump over a drone. */
public class Pulse extends Actor {
    private double previousX;
    private double previousY;
    private double remaining = 1.6;

    public Pulse(Player player) {
        super(player.x(), player.y());
        setSize(10, 10);
        setRotation(player.rotation());
        moveForward(24, 1); // Begin just beyond the robot's barrel.
        previousX = x();
        previousY = y();
    }

    @Override protected void onUpdate(double seconds) {
        previousX = x();
        previousY = y();
        moveForward(360, seconds);
        remaining = Math.max(0, remaining - seconds);
    }

    public boolean isActive() { return remaining > 0; }
    public void expire() { remaining = 0; }

    public boolean hits(Enemy enemy) {
        double dx = x() - previousX;
        double dy = y() - previousY;
        double distanceSquared = dx * dx + dy * dy;
        double along = distanceSquared == 0 ? 0
                : ((enemy.x() - previousX) * dx + (enemy.y() - previousY) * dy) / distanceSquared;
        along = Math.max(0, Math.min(1, along));
        double closestX = previousX + along * dx;
        double closestY = previousY + along * dy;
        return Math.hypot(enemy.x() - closestX, enemy.y() - closestY)
                <= (width() + enemy.width()) / 2;
    }

    @Override public void draw() {
        fill(Color.rgb(157, 234, 255));
        circle(0, 0, width());
    }
}
