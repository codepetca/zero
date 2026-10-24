import zero.Actor;
import zero.Color;

/** Both paddles use the same movement rules, with different speeds and colours. */
public class Paddle extends Actor {
    private final double speed;
    private final Color color;
    private final double courtTop;
    private final double courtBottom;
    private int direction;

    public Paddle(double x, double y, double height, double speed, Color color,
                  double courtTop, double courtBottom) {
        super(x, y);
        setSize(14, height);
        this.speed = speed;
        this.color = color;
        this.courtTop = courtTop;
        this.courtBottom = courtBottom;
    }

    public void setDirection(int direction) {
        this.direction = direction;
    }

    public void aimAt(double targetY) {
        // A small dead zone stops the computer from shaking at its target.
        direction = 0;
        if (targetY < y() - 10) direction = -1;
        if (targetY > y() + 10) direction = 1;
    }

    @Override protected void onUpdate(double seconds) {
        move(0, direction * speed * seconds);
        double half = height() / 2;
        setPosition(x(), Math.max(courtTop + half, Math.min(y(), courtBottom - half)));
    }

    @Override public void draw() {
        fill(color);
        rect(-width() / 2, -height() / 2, width(), height());
    }
}
