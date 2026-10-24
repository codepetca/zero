import zero.Actor;
import zero.Collisions;
import zero.Color;

public class Coin extends Actor {
    final double radius = 11;
    boolean collected;

    public Coin(double x, double y) {
        super(x, y);
        setSize(radius * 2, radius * 2);
    }

    public boolean collectIfTouching(Player player) {
        if (!collected && Collisions.circleHitsCircle(x(), y(), radius,
                player.x(), player.y(), player.radius)) {
            collected = true;
            return true;
        }
        return false;
    }

    public void draw() {
        if (collected) return;

        fill(Color.rgb(224, 166, 21));
        circle(0, 3, radius * 2 + 4);
        fill(Color.GOLD);
        circle(0, 0, radius * 2);
        fill(Color.WHITE);
        circle(-3, -3, 5);
    }
}
