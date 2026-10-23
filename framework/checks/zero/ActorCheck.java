package zero;

import javafx.application.Platform;
import javafx.scene.image.Image;
import javafx.scene.image.WritableImage;
import javafx.scene.paint.Color;

/** Finite Actor behavior and rendered-pixel checks in a real native GameApp. */
public final class ActorCheck extends GameApp {
    private boolean checked;
    @Override public void settings() { size(120, 100); title("Zero Actor checks"); }
    @Override public void setup() {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_ACTOR_TIMEOUT"); System.exit(1);
        });
        watchdog.setDaemon(true); watchdog.start();
    }
    @Override public void draw() {
        if (checked) return;
        checked = true;
        try {
            verifyMovement(); verifyImagesAndInheritance(); verifyPixels();
            System.out.println("ZERO_ACTOR_OK movement/aiming/clamping, validation/atomicity, subclass animation, rotated pixels");
            Platform.exit();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }

    private void verifyMovement() {
        Actor actor = new Actor(new WritableImage(4, 2), 10, 20);
        near(actor.width(), 4, "natural width"); near(actor.height(), 2, "natural height");
        near(actor.rotation(), 0, "initial heading");
        actor.move(3, -4); position(actor, 13, 16);
        actor.setPosition(0, 0);
        actor.moveForward(100, 0.25); position(actor, 25, 0);
        actor.rotate(90); actor.moveForward(100, 0.5); position(actor, 25, 50);
        actor.moveForward(-100, 0.1); position(actor, 25, 40);
        actor.setRotation(-90); near(actor.rotation(), 270, "negative rotation wraps");
        actor.rotate(810); near(actor.rotation(), 0, "large turn wraps");
        actor.setRotation(-Double.MIN_VALUE);
        require(actor.rotation() >= 0 && actor.rotation() < 360, "tiny angle stays inside normalized range");
        actor.setPosition(0, 0);
        actor.face(0, 10); near(actor.rotation(), 90, "face down");
        actor.face(-10, 0); near(actor.rotation(), 180, "face left");
        actor.face(0, -10); near(actor.rotation(), 270, "face up");
        actor.face(10, 0); near(actor.rotation(), 0, "face right");
        actor.moveToward(30, 40, 20, 1); position(actor, 12, 16);
        near(actor.rotation(), Math.toDegrees(Math.atan2(4, 3)), "diagonal heading");
        actor.moveToward(30, 40, 100, 1); position(actor, 30, 40);
        double heading = actor.rotation();
        actor.moveToward(30, 40, 100, 1); actor.face(30, 40);
        near(actor.rotation(), heading, "same target preserves heading");
        actor.moveToward(30, -40, 0, 1); position(actor, 30, 40);
        near(actor.rotation(), 270, "zero speed still aims");
        actor.moveToward(-40, 40, 100, 0); position(actor, 30, 40);
        near(actor.rotation(), 180, "zero seconds still aims");
        for (double bad : new double[] {Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            unchanged(actor, () -> actor.setPosition(12, bad));
            unchanged(actor, () -> actor.setSize(12, bad));
            unchanged(actor, () -> actor.setRotation(bad));
            unchanged(actor, () -> actor.rotate(bad));
            unchanged(actor, () -> actor.move(12, bad));
            unchanged(actor, () -> actor.face(12, bad));
            unchanged(actor, () -> actor.moveForward(bad, 1));
            unchanged(actor, () -> actor.moveToward(12, 13, 10, bad));
        }
        unchanged(actor, () -> actor.setSize(0, 10));
        unchanged(actor, () -> actor.setSize(10, -1));
        unchanged(actor, () -> actor.moveForward(10, -1));
        unchanged(actor, () -> actor.moveToward(0, 0, -1, 1));
        unchanged(actor, () -> actor.moveToward(0, 0, 1, -1));
        unchanged(actor, () -> actor.moveToward(0, 0, Double.MAX_VALUE, 2));
        unchanged(actor, () -> actor.moveForward(Double.MAX_VALUE, 2));
        actor.setPosition(Double.MAX_VALUE, 1);
        unchanged(actor, () -> actor.move(Double.MAX_VALUE, 0));
        actor.setPosition(-Double.MAX_VALUE, -Double.MAX_VALUE);
        actor.face(Double.MAX_VALUE, 0);
        near(actor.rotation(), Math.toDegrees(Math.atan2(1, 2)), "overflow-safe aiming");
        actor.moveToward(Double.MAX_VALUE, Double.MAX_VALUE, 1, 1);
        require(Double.isFinite(actor.x()) && Double.isFinite(actor.y()), "distant finite target keeps finite state");
    }

    private void verifyImagesAndInheritance() {
        WritableImage sheet = new WritableImage(4, 2);
        ImageRegion region = new ImageRegion(sheet, 0, 0, 2, 2);
        SpriteAnimation walk = new SpriteAnimation(sheet, 2, 1, 2);
        Player player = new Player(walk, 30, 40);
        player.setSize(20, 30); player.setRotation(15);
        player.update(0.5);
        position(player, 35, 40); require(walk.frameIndex() == 1, "subclass calls super to advance animation");
        player.draw(this); player.draw(this);
        require(walk.frameIndex() == 1, "drawing does not advance animation");
        unchanged(player, () -> player.update(-1));
        player.setImage(sheet); player.update(1);
        require(walk.frameIndex() == 1, "replaced animation stops advancing");
        player.setImage(region); player.setImage(walk);
        position(player, 45, 40);
        near(player.width(), 20, "replacement preserves display width");
        near(player.height(), 30, "replacement preserves display height");
        near(player.rotation(), 15, "replacement preserves rotation");
        player.setImage(new SpriteAnimation(sheet, 2, 1, 2)); player.update(0);
        require(walk.frameIndex() == 1, "new animation has independent clock");
        near(new Actor(region, 0, 0).width(), 2, "region natural size");
        near(new Actor(walk, 0, 0).height(), 2, "animation natural size");
        expectNull(() -> player.setImage((Image) null));
        expectNull(() -> player.setImage((ImageRegion) null));
        expectNull(() -> player.setImage((SpriteAnimation) null));
        expectNull(() -> player.draw(null));
    }

    private void verifyPixels() {
        WritableImage sheet = new WritableImage(4, 2);
        for (int y = 0; y < 2; y++) for (int x = 0; x < 4; x++) {
            sheet.getPixelWriter().setColor(x, y, x < 2 ? Color.RED : Color.BLUE);
        }
        background(Color.WHITE);
        Actor actor = new Actor(sheet, 30, 30);
        actor.setSize(40, 20); actor.setRotation(90);
        fill(Color.GREEN); actor.draw(this); rect(80, 5, 10, 10);
        ImageRegion blue = new ImageRegion(sheet, 2, 0, 2, 2);
        actor.setImage(blue); actor.setPosition(70, 60); actor.setSize(20, 20); actor.draw(this);
        WritableImage pixels = canvas().snapshot(null, null);
        color(pixels, 30, 20, Color.RED); color(pixels, 30, 40, Color.BLUE);
        color(pixels, 15, 30, Color.WHITE); color(pixels, 70, 60, Color.BLUE);
        color(pixels, 85, 10, Color.GREEN);
    }

    private static final class Player extends Actor {
        Player(SpriteAnimation animation, double x, double y) { super(animation, x, y); }
        @Override public void update(double seconds) {
            super.update(seconds);
            move(10 * seconds, 0);
        }
    }
    private static void unchanged(Actor actor, Runnable action) {
        double x = actor.x(), y = actor.y(), width = actor.width(), height = actor.height(), rotation = actor.rotation();
        try { action.run(); throw new AssertionError("Expected invalid Actor argument"); }
        catch (IllegalArgumentException expected) { }
        require(actor.x() == x && actor.y() == y && actor.width() == width && actor.height() == height
                && actor.rotation() == rotation, "invalid operation changed Actor state");
    }
    private static void expectNull(Runnable action) {
        try { action.run(); throw new AssertionError("Expected null Actor argument"); }
        catch (NullPointerException expected) { }
    }
    private static void color(WritableImage image, int x, int y, Color expected) {
        require(image.getPixelReader().getColor(x, y).equals(expected), "Actor pixel " + x + "," + y + " expected " + expected);
    }
    private static void position(Actor actor, double x, double y) { near(actor.x(), x, "x"); near(actor.y(), y, "y"); }
    private static void near(double actual, double expected, String message) {
        require(Math.abs(actual - expected) < 0.000001, message + ": " + actual + " != " + expected);
    }
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    public static void main(String[] args) { launch(args); }
}
