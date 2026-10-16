import javafx.scene.image.Image;
import zero.GameApp;

/** Gravity and axis-by-axis solid response, using small bounded simulation steps. */
public class Player {
    private double x, y;
    private double velocityY;
    private boolean grounded;
    private final double size = 32;

    public Player(double x, double y) { this.x = x; this.y = y; }

    public void update(int horizontal, boolean jumpPressed, double seconds,
                       double worldWidth, Platform[] platforms) {
        if (jumpPressed && grounded) { velocityY = -440; grounded = false; }
        double elapsed = Math.max(0, Math.min(seconds, 0.1));
        int steps = (int) Math.ceil(elapsed * 120);
        if (steps == 0) return;
        double step = elapsed / steps;
        for (int count = 0; count < steps; count++) {
            move(horizontal, step, worldWidth, platforms);
        }
    }

    private void move(int horizontal, double step, double worldWidth, Platform[] platforms) {
        double movementX = horizontal * 200 * step;
        x = Math.max(0, Math.min(x + movementX, Math.max(0, worldWidth - size)));
        for (Platform platform : platforms) {
            if (overlaps(platform)) {
                if (movementX > 0) x = platform.x - size;
                if (movementX < 0) x = platform.x + platform.width;
            }
        }
        velocityY = Math.min(800, velocityY + 1200 * step);
        y += velocityY * step;
        grounded = false;
        for (Platform platform : platforms) {
            if (overlaps(platform)) {
                if (velocityY > 0) { y = platform.y - size; grounded = true; }
                else if (velocityY < 0) y = platform.y + platform.height;
                velocityY = 0;
            }
        }
    }

    private boolean overlaps(Platform platform) {
        // Strict overlap lets a player standing on top move along the floor.
        return x + size > platform.x && x < platform.x + platform.width
                && y + size > platform.y && y < platform.y + platform.height;
    }

    public double x() { return x; }
    public double y() { return y; }
    public double centreX() { return x + size / 2; }
    public double centreY() { return y + size / 2; }
    public boolean isGrounded() { return grounded; }

    public boolean touches(double otherX, double otherY, double width, double height) {
        return x + size >= otherX && x <= otherX + width
                && y + size >= otherY && y <= otherY + height;
    }

    public void draw(GameApp app, Image sprite) { app.image(sprite, x, y, size, size); }
}
