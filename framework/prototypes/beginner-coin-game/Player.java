import zero.Actor;
import zero.Color;

public class Player extends Actor {
    final double radius = 12;

    public Player(double x, double y) {
        super(x, y);
        setSize(radius * 2, radius * 2);
    }

    public void moveToward(double targetX, double targetY, double seconds) {
        super.moveToward(targetX, targetY, 260, seconds);
    }

    public void draw() {
        fill(Color.rgb(40, 70, 150));
        circle(0, 3, radius * 2 + 3);
        fill(Color.BLUE);
        circle(0, 0, radius * 2);
        fill(Color.WHITE);
        circle(-4, -3, 5);
        circle(4, -3, 5);
    }
}
