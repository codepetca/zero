import zero.Collisions;

public class Coin {
    final double x;
    final double y;
    final double radius = 10;
    boolean collected;

    public Coin(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public boolean collectIfTouching(Player player) {
        if (!collected && Collisions.circleHitsCircle(x, y, radius,
                player.x, player.y, player.radius)) {
            collected = true;
            return true;
        }
        return false;
    }
}
