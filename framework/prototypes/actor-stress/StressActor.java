import zero.Actor;
import zero.SpriteAnimation;

public class StressActor extends Actor {
    private double vx;
    private double vy;

    public StressActor(SpriteAnimation animation, double x, double y, double vx, double vy) {
        super(animation, x, y);
        setSize(32, 32);
        this.vx = vx;
        this.vy = vy;
    }

    public void update(double seconds) {
        super.update(seconds);
        move(vx * seconds, vy * seconds);
        rotate(35 * seconds);
        if (x() < 16 || x() > 784) {
            vx = -vx;
            setPosition(Math.max(16, Math.min(784, x())), y());
        }
        if (y() < 16 || y() > 434) {
            vy = -vy;
            setPosition(x(), Math.max(16, Math.min(434, y())));
        }
    }
}
