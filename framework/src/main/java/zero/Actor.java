package zero;

import java.util.Objects;
import javafx.scene.image.Image;

/** A sprite or drawing with a centre position and explicit movement. Main owns its game rules and lifecycle. */
public class Actor {
    private double x, y, width, height, rotation;
    private ImageRegion region;
    private AnimationPlayback playback;
    private GameApp drawingApp;

    /** Create an actor without artwork, with a logical size of one pixel by one pixel. */
    public Actor(double x, double y) {
        setPosition(x, y);
        setSize(1, 1);
    }

    public Actor(Image image, double x, double y) {
        this(fullImage(image), x, y);
    }

    public Actor(ImageRegion region, double x, double y) {
        setImage(region);
        setPosition(x, y);
        setSize(region.width(), region.height());
    }

    public Actor(SpriteAnimation animation, double x, double y) {
        this((AnimationSource) Objects.requireNonNull(animation, "Animation must not be null."), x, y);
    }

    public Actor(AnimationSource source, double x, double y) {
        this(x, y);
        setImage(source);
        setSize(region.width(), region.height());
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
        playback = null;
    }

    public final void setImage(SpriteAnimation animation) {
        setImage((AnimationSource) Objects.requireNonNull(animation, "Animation must not be null."));
    }

    public final void setImage(AnimationSource source) {
        Objects.requireNonNull(source, "Animation source must not be null.");
        AnimationPlayback candidate = source.createPlayback();
        if (candidate == null) throw new IllegalStateException("Animation source createPlayback() must not return null.");
        ImageRegion frame = requireFrame(candidate);
        playback = candidate;
        region = frame;
    }

    /** Validate time, run behaviour, then advance the current playback exactly once. */
    public final void update(double seconds) {
        nonNegative(seconds, "Actor seconds");
        onUpdate(seconds);
        if (playback != null) {
            playback.update(seconds);
            region = requireFrame(playback);
        }
    }

    /** Override for behaviour. Main calls update(seconds); no super call is needed. */
    protected void onUpdate(double seconds) { }

    private static ImageRegion requireFrame(AnimationPlayback playback) {
        ImageRegion frame = playback.frame();
        if (frame == null) throw new IllegalStateException("Animation playback frame() must not return null.");
        return frame;
    }

    /** Run this actor's drawing callback in local coordinates, preserving the app's drawing settings. */
    public void draw(GameApp app) {
        Objects.requireNonNull(app, "Game app must not be null.");
        var graphics = app.graphics();
        if (graphics == null) throw new IllegalStateException("Draw actors inside setup() or a game drawing callback after the canvas exists.");
        GameApp previousApp = drawingApp;
        graphics.save();
        drawingApp = app;
        try {
            graphics.translate(x, y);
            graphics.rotate(rotation);
            draw();
        } finally {
            try { graphics.restore(); }
            finally { drawingApp = previousApp; }
        }
    }

    /** Override to draw about local 0,0. The default draws the sprite, if present, without advancing it. */
    public void draw() {
        GameApp app = drawingApp();
        if (region != null) app.imageCentered(region, 0, 0, width, height, 0);
    }

    protected final void fill(zero.Color color) { drawingApp().fill(color); }
    protected final void stroke(zero.Color color) { drawingApp().stroke(color); }
    protected final void strokeWidth(double pixels) { drawingApp().strokeWidth(pixels); }
    protected final void textSize(double pixels) { drawingApp().textSize(pixels); }
    protected final void rect(double x, double y, double width, double height) { drawingApp().rect(x, y, width, height); }
    protected final void outlineRect(double x, double y, double width, double height) { drawingApp().outlineRect(x, y, width, height); }
    protected final void circle(double centreX, double centreY, double diameter) { drawingApp().circle(centreX, centreY, diameter); }
    protected final void line(double x1, double y1, double x2, double y2) { drawingApp().line(x1, y1, x2, y2); }
    protected final void text(String value, double x, double y) { drawingApp().text(value, x, y); }
    protected final void textCentered(String value, double x, double y) { drawingApp().textCentered(value, x, y); }

    private GameApp drawingApp() {
        if (drawingApp == null) throw new IllegalStateException("Use Actor drawing helpers inside draw(), called by app.draw(actor) or actor.draw(app).");
        return drawingApp;
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
