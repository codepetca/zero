import zero.Actor;
import zero.SpriteAnimation;

public class StressActor extends Actor {
    private double vx;
    private double vy;

    public StressActor(SpriteAnimation animation, double x, double y, double vx, double vy, int size) {
        super(animation, x, y);
        setSize(size, size);
        this.vx = vx;
        this.vy = vy;
    }

    @Override protected void onUpdate(double seconds) {
        move(vx * seconds, vy * seconds);
        rotate(35 * seconds);
        double half = width() / 2;
        if (x() < half || x() > 800 - half) {
            vx = -vx;
            setPosition(Math.max(half, Math.min(800 - half, x())), y());
        }
        if (y() < half || y() > 450 - half) {
            vy = -vy;
            setPosition(x(), Math.max(half, Math.min(450 - half, y())));
        }
    }
}
