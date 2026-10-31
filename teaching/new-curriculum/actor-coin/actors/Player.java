import zero.Actor;
import zero.Color;

public class Player extends Actor {
    public Player(double x, double y) {
        super(x, y);
        setSize(24, 24);
    }

    public void steer(int horizontal, int vertical, double seconds) {
        move(horizontal * 180 * seconds, vertical * 180 * seconds);
        setPosition(Math.max(12, Math.min(x(), 628)), Math.max(12, Math.min(y(), 348)));
    }

    @Override public void draw() {
        fill(Color.rgb(100, 149, 237));
        rect(-12, -12, 24, 24);
    }
}
