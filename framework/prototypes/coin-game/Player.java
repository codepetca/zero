/** Ordinary Java state and explicit movement; no framework inheritance needed. */
public class Player {
    double x;
    double y;
    final double radius = 12;

    public Player(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public void moveToward(double targetX, double targetY, double seconds) {
        double dx = targetX - x;
        double dy = targetY - y;
        double distance = Math.hypot(dx, dy);
        if (distance > 0) {
            double step = Math.min(260 * seconds, distance);
            x += dx / distance * step;
            y += dy / distance * step;
        }
    }
}
