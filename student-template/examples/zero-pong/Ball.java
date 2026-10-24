import zero.Actor;
import zero.Color;

/** The ball owns movement and bounces; Main decides when somebody scores. */
public class Ball extends Actor {
    private final double startX;
    private final double startY;
    private final double courtTop;
    private final double courtBottom;
    private double velocityX;
    private double velocityY;
    private double serveDelay;

    public Ball(double x, double y, double courtTop, double courtBottom) {
        super(x, y);
        setSize(16, 16);
        startX = x;
        startY = y;
        this.courtTop = courtTop;
        this.courtBottom = courtBottom;
    }

    public void serve(int direction) {
        setPosition(startX, startY);
        velocityX = direction * 290;
        velocityY = direction * 125;
        serveDelay = 0.9;
    }

    public boolean movingRight() { return velocityX > 0; }
    public boolean isServing() { return serveDelay > 0; }

    @Override protected void onUpdate(double seconds) {
        if (serveDelay > 0) {
            serveDelay = Math.max(0, serveDelay - seconds);
            return;
        }
        move(velocityX * seconds, velocityY * seconds);
        double radius = width() / 2;
        if (y() - radius < courtTop) {
            setPosition(x(), courtTop + radius);
            velocityY = Math.abs(velocityY);
        } else if (y() + radius > courtBottom) {
            setPosition(x(), courtBottom - radius);
            velocityY = -Math.abs(velocityY);
        }
    }

    public void bounceOff(Paddle paddle, boolean leftPaddle) {
        if (isServing()) return;
        // Only the paddle the ball is travelling towards can return it.
        if (leftPaddle && velocityX >= 0) return;
        if (!leftPaddle && velocityX <= 0) return;
        double radius = width() / 2;
        boolean overlapsX = x() + radius >= paddle.x() - paddle.width() / 2
                && x() - radius <= paddle.x() + paddle.width() / 2;
        boolean overlapsY = y() + radius >= paddle.y() - paddle.height() / 2
                && y() - radius <= paddle.y() + paddle.height() / 2;
        if (!overlapsX || !overlapsY) return;

        double direction = leftPaddle ? 1 : -1;
        // Put the ball outside the paddle so it cannot bounce twice inside it.
        setPosition(paddle.x() + direction * (paddle.width() / 2 + radius), y());
        velocityX = direction * Math.min(460, Math.abs(velocityX) + 18);
        double hitPosition = (y() - paddle.y()) / (paddle.height() / 2);
        hitPosition = Math.max(-1, Math.min(1, hitPosition));
        velocityY = hitPosition * 280;
    }

    @Override public void draw() {
        fill(Color.WHITE);
        circle(0, 0, width());
    }
}
