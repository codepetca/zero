package zero;

import java.util.Objects;
import javafx.scene.image.Image;

/** A sprite with a centre position and explicit movement. Main owns its game rules and lifecycle. */
public class Actor {
    private double x, y, width, height, rotation;
    private ImageRegion region;
    private SpriteAnimation animation;

    public Actor(Image image, double x, double y) {
        this(fullImage(image), x, y);
    }

    public Actor(ImageRegion region, double x, double y) {
        setImage(region);
        setPosition(x, y);
        setSize(region.width(), region.height());
    }

    public Actor(SpriteAnimation animation, double x, double y) {
        this(Objects.requireNonNull(animation, "Animation must not be null.").frame(), x, y);
        setImage(animation);
    }

    public final double x() { return x; }
    public final double y() { return y; }
    public final double width() { return width; }
    public final double height() { return height; }
    public final double rotation() { return rotation; }

    public final void setPosition(double x, double y) {
        finite(x, "Actor x"); finite(y, "Actor y");
        this.x = x; this.y = y;
    }

    public final void setSize(double width, double height) {
        positive(width, "Actor width"); positive(height, "Actor height");
        this.width = width; this.height = height;
    }

    public final void setRotation(double degrees) {
        finite(degrees, "Actor rotation");
        rotation = normalized(degrees);
    }

    /** Move by canvas pixels. Multiply a velocity by seconds at the call site. */
    public final void move(double dx, double dy) {
        finite(dx, "Movement dx"); finite(dy, "Movement dy");
        setPosition(x + dx, y + dy);
    }

    /** Move along the current heading at a signed speed in pixels per second. */
    public final void moveForward(double speed, double seconds) {
        finite(speed, "Movement speed"); nonNegative(seconds, "Movement seconds");
        double distance = speed * seconds;
        finite(distance, "Movement distance");
        double radians = Math.toRadians(rotation);
        move(Math.cos(radians) * distance, Math.sin(radians) * distance);
    }

    public final void rotate(double degrees) {
        finite(degrees, "Rotation change");
        setRotation(rotation + degrees % 360);
    }

    /** Face a canvas coordinate. The same position keeps the current heading. */
    public final void face(double targetX, double targetY) {
        finite(targetX, "Target x"); finite(targetY, "Target y");
        if (targetX == x && targetY == y) return;
        double dx = targetX - x, dy = targetY - y;
        if (!Double.isFinite(dx) || !Double.isFinite(dy)) {
            double scale = coordinateScale(targetX, targetY);
            dx = targetX / scale - x / scale;
            dy = targetY / scale - y / scale;
        }
        setRotation(Math.toDegrees(Math.atan2(dy, dx)));
    }

    /** Face and approach a coordinate at pixels per second, stopping at the target. */
    public final void moveToward(double targetX, double targetY, double speed, double seconds) {
        finite(targetX, "Target x"); finite(targetY, "Target y");
        nonNegative(speed, "Movement speed"); nonNegative(seconds, "Movement seconds");
        double travel = speed * seconds;
        finite(travel, "Movement distance");
        if (targetX == x && targetY == y) return;
        double dx = targetX - x, dy = targetY - y;
        double distance = Math.hypot(dx, dy);
        if (!Double.isFinite(distance)) {
            // Scale before subtracting when distant finite coordinates overflow.
            double scale = coordinateScale(targetX, targetY);
            dx = targetX / scale - x / scale;
            dy = targetY / scale - y / scale;
            double length = Math.hypot(dx, dy);
            distance = length * scale;
            dx /= length; dy /= length;
        } else {
            dx /= distance; dy /= distance;
        }
        double nextX = travel >= distance ? targetX : x + dx * travel;
        double nextY = travel >= distance ? targetY : y + dy * travel;
        // Validate the whole result before changing position or heading.
        finite(nextX, "Actor x"); finite(nextY, "Actor y");
        double heading = normalized(Math.toDegrees(Math.atan2(dy, dx)));
        x = nextX; y = nextY; rotation = heading;
    }

    /** Replace artwork without changing position, display size or rotation. */
    public final void setImage(Image image) {
        setImage(fullImage(image));
    }

    public final void setImage(ImageRegion region) {
        this.region = Objects.requireNonNull(region, "Image region must not be null.");
        animation = null;
    }

    public final void setImage(SpriteAnimation animation) {
        this.animation = Objects.requireNonNull(animation, "Animation must not be null.");
        region = animation.frame();
    }

    /** Explicitly advance this actor's animation. Overrides should call super.update(seconds). */
    public void update(double seconds) {
        nonNegative(seconds, "Actor seconds");
        if (animation != null) animation.update(seconds);
    }

    /** Draw the current sprite about its centre. Drawing never advances animation. */
    public void draw(GameApp app) {
        Objects.requireNonNull(app, "Game app must not be null.");
        app.imageCentered(animation == null ? region : animation.frame(), x, y, width, height, rotation);
    }

    private static ImageRegion fullImage(Image image) {
        Objects.requireNonNull(image, "Image must not be null.");
        ImageRegion.requireLoaded(image);
        return new ImageRegion(image, 0, 0, image.getWidth(), image.getHeight());
    }

    private double coordinateScale(double targetX, double targetY) {
        return Math.max(Math.max(Math.abs(x), Math.abs(y)), Math.max(Math.abs(targetX), Math.abs(targetY)));
    }

    private static double normalized(double degrees) {
        double result = degrees % 360;
        double wrapped = result == 0 ? 0 : result < 0 ? result + 360 : result;
        // Tiny negative angles can round up to exactly 360 when adding a turn.
        return wrapped == 360 ? 0 : wrapped;
    }

    private static void finite(double value, String name) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(name + " must be finite.");
    }

    private static void positive(double value, String name) {
        finite(value, name);
        if (value <= 0) throw new IllegalArgumentException(name + " must be positive.");
    }

    private static void nonNegative(double value, String name) {
        finite(value, name);
        if (value < 0) throw new IllegalArgumentException(name + " must be non-negative.");
    }
}
