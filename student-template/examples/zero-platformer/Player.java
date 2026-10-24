import zero.Actor;
import zero.Color;

/** A centre-positioned Actor with student-written gravity and one-way landings. */
public class Player extends Actor {
    private final Platform[] platforms;
    private final double levelWidth;
    private double velocityY;
    private int horizontal;
    private boolean grounded;
    private boolean jumpRequested;

    public Player(double x, double y, double levelWidth, Platform[] platforms) {
        super(x, y);
        setSize(28, 36);
        this.levelWidth = levelWidth;
        this.platforms = platforms;
    }

    public void control(int horizontal, boolean jumpPressed) {
        this.horizontal = horizontal;
        jumpRequested = jumpPressed;
    }

    @Override protected void onUpdate(double seconds) {
        if (jumpRequested && grounded) {
            velocityY = -500;
            grounded = false;
        }
        jumpRequested = false; // A held jump key never bounces automatically.
        // Small steps keep the simple landing calculation reliable after a slow frame.
        int steps = (int) Math.ceil(seconds * 120);
        if (steps == 0) return;
        double step = seconds / steps;
        for (int count = 0; count < steps; count++) moveStep(step);
    }

    private void moveStep(double seconds) {
        double halfWidth = width() / 2;
        double halfHeight = height() / 2;
        double nextX = x() + horizontal * 230 * seconds;
        nextX = Math.max(halfWidth, Math.min(levelWidth - halfWidth, nextX));
        double previousFeet = y() + halfHeight;
        velocityY = Math.min(850, velocityY + 1350 * seconds);
        double nextY = y() + velocityY * seconds;
        double landingTop = Double.POSITIVE_INFINITY;
        grounded = false;
        for (Platform platform : platforms) {
            boolean aboveTop = previousFeet <= platform.y;
            boolean crossesTop = nextY + halfHeight >= platform.y;
            boolean overPlatform = nextX + halfWidth > platform.x
                    && nextX - halfWidth < platform.x + platform.width;
            if (velocityY >= 0 && aboveTop && crossesTop && overPlatform) {
                landingTop = Math.min(landingTop, platform.y);
            }
        }
        if (landingTop != Double.POSITIVE_INFINITY) {
            nextY = landingTop - halfHeight;
            velocityY = 0;
            grounded = true;
        }
        setPosition(nextX, nextY);
    }

    /** Ordinary rectangle overlap for coins and the exit, separate from landing. */
    public boolean touches(double left, double top, double otherWidth, double otherHeight) {
        return x() + width() / 2 >= left && x() - width() / 2 <= left + otherWidth
                && y() + height() / 2 >= top && y() - height() / 2 <= top + otherHeight;
    }

    @Override public void draw() {
        // Actor's local drawing helpers preserve the GameApp's drawing settings.
        fill(Color.rgb(235, 111, 76));
        rect(-14, -18, 28, 36);
        fill(Color.rgb(251, 208, 117));
        rect(-17, -21, 34, 7);
        fill(Color.WHITE);
        rect(-9, -10, 7, 7);
        rect(3, -10, 7, 7);
        fill(Color.rgb(32, 66, 87));
        rect(horizontal < 0 ? -9 : -6, -8, 3, 4);
        rect(horizontal < 0 ? 3 : 6, -8, 3, 4);
        rect(-8, 13, 6, 5);
        rect(3, 13, 6, 5);
    }
}
