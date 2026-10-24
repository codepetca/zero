import zero.Actor;
import zero.Color;
import zero.ImageRegion;

/** The robot owns movement and its short protection timer after a hit. */
public class Player extends Actor {
    private int horizontal;
    private int vertical;
    private int health = 3;
    private double arenaWidth;
    private double arenaHeight;
    private double protection;

    public Player(ImageRegion image, double x, double y) {
        super(image, x, y);
        setSize(30, 30);
    }

    public void steer(int horizontal, int vertical, double width, double height) {
        this.horizontal = horizontal;
        this.vertical = vertical;
        arenaWidth = width;
        arenaHeight = height;
    }

    @Override protected void onUpdate(double seconds) {
        protection = Math.max(0, protection - seconds);
        if (horizontal != 0 || vertical != 0) {
            face(x() + horizontal, y() + vertical);
            moveForward(190, seconds); // Diagonal movement has the same speed.
        }
        double radius = width() / 2;
        setPosition(Math.max(radius, Math.min(arenaWidth - radius, x())),
                Math.max(radius, Math.min(arenaHeight - radius, y())));
    }

    public int health() { return health; }

    public boolean takeHit() {
        if (protection > 0 || health == 0) return false;
        health--;
        protection = 1.2;
        return true;
    }

    @Override public void draw() {
        if (protection > 0) {
            stroke(Color.WHITE);
            strokeWidth(2);
            outlineRect(-19, -19, 38, 38);
        }
        super.draw();
        fill(Color.WHITE);
        rect(10, -3, 14, 6); // Local +x is the direction of movement and fire.
    }
}
