import javafx.scene.image.Image;
import javafx.scene.input.KeyCode;
import javafx.scene.input.MouseButton;
import javafx.scene.paint.Color;
import zero.Actor;
import zero.Collisions;
import zero.ImageRegion;
import zero.GameApp;
import zero.SpriteAnimation;

/** Release check: exercise the supported canvas API through the real exporter. */
public final class Main extends GameApp {
    private Image sheet;
    private ImageRegion region;
    private SpriteAnimation animation, sequence;
    private int presses, clicks, initCalls;
    private double x = 150;
    private boolean paused;
    private int digits, escapes;
    private int middleClicks, rightClicks, keyPresses;
    private String gameApiStatus;
    private Actor imageActor, regionActor, animatedActor;
    private final Actor emptyActor = new Actor(5, 5);
    private final ShapeActor rotatedShape = new ShapeActor(400, 140);
    private final ShapeActor straightShape = new ShapeActor(440, 140);
    private final FailingActor failingActor = new FailingActor();
    private final LegacyActor legacyActor = new LegacyActor();
    private final NestedActor nestedActor = new NestedActor(this);
    @Override public void init() {
        if (++initCalls != 1) throw new IllegalStateException("Application.init must run exactly once");
    }
    @Override public void settings() { title("Zero web helpers"); size(480, 400); padding(0); }
    @Override public void setup() {
        if (initCalls != 1) throw new IllegalStateException("Application.init must run before setup");
        gameApiStatus = GameApiChecks.verify(3, 4, "pha");
        boolean invalidRgb = false;
        try { Color.rgb(256, 0, 0); } catch (IllegalArgumentException expected) { invalidRgb = true; }
        if (!invalidRgb) throw new IllegalStateException("Color.rgb must reject out-of-range channels");
        sheet = loadImage("/tiles.png");
        if (sheet != loadImage("/./tiles.png")) throw new IllegalStateException("Image aliases lost cache identity");
        region = imageRegion(sheet, 0, 0, 12, 12);
        animation = loadAnimation("/tiles.png", 2, 2, 12);
        sequence = new SpriteAnimation(8, region, imageRegion(sheet, 12, 0, 12, 12));
        if (region.image() != sheet || region.x() != 0 || region.y() != 0 || region.width() != 12 || region.height() != 12
                || animation.frameCount() != 4 || animation.columns() != 2 || animation.rows() != 2
                || animation.fps() != 12 || animation.image() != sheet || animation.frame().width() != 12
                || sequence.frameIndex() != 0) throw new IllegalStateException("Sprite API check failed");
        if (!Collisions.circleHitsRect(5, 5, 3, 6, 6, 4, 4)
                || !Collisions.rectHitsRect(0, 0, 4, 4, 4, 4, 2, 2)
                || !Collisions.circleHitsCircle(0, 0, 2, 3, 0, 2)) throw new IllegalStateException("Collision API check failed");
        if (canvas() == null || graphics() == null || layout() == null) throw new IllegalStateException("JavaFX escape hatches missing");
        canvas().setAccessibleText("Zero web helper check");
        sequence.reset();
        verifyActors();
        require(emptyActor.width() == 1 && emptyActor.height() == 1, "Image-free actor logical size");
        rotatedShape.setRotation(90);
        boolean unbound = false;
        try { failingActor.outside(); } catch (IllegalStateException expected) { unbound = true; }
        require(unbound, "Actor helper must reject an unbound drawing context");
    }
    @Override public void update(double seconds) {
        if (!windowFocused()) paused = true;
        if (keyPressed(KeyCode.P)) paused = !paused;
        if (keyPressed(KeyCode.SPACE)) presses++;
        if (keyPressed(KeyCode.DIGIT1)) digits = digits * 10 + 1;
        if (keyPressed(KeyCode.DIGIT2)) digits = digits * 10 + 2;
        if (keyPressed(KeyCode.DIGIT3)) digits = digits * 10 + 3;
        if (keyPressed(KeyCode.ESCAPE)) escapes++;
        if (mousePressed(MouseButton.PRIMARY)) clicks++;
        if (mousePressed(MouseButton.MIDDLE)) middleClicks++;
        if (mousePressed(MouseButton.SECONDARY)) rightClicks++;
        if (keyPressed(KeyCode.A)) keyPresses++;
        if (!paused) {
            animation.update(seconds); sequence.update(seconds);
            if (keyDown(KeyCode.RIGHT)) x += 100 * seconds;
        }
    }
    @Override public void draw() {
        background(Color.WHITE); fill(Color.BLACK); textSize(20);
        text("Web helpers ready", 15, 30);
        text("Mobile state: " + clicks + "," + middleClicks + "," + rightClicks + ","
                + mouseDown(MouseButton.PRIMARY) + "," + mouseDown(MouseButton.MIDDLE) + ","
                + mouseDown(MouseButton.SECONDARY) + "," + (int) mouseX() + "," + (int) mouseY()
                + "," + (int) width() + "," + (int) height() + "," + keyPresses + "," + keyDown(KeyCode.A), 5, 390);
        text("Presses: " + presses, 15, 58);
        text("Clicks: " + clicks, 15, 86);
        text("Position: " + (int) x, 15, 114);
        text(paused ? "Paused" : "Playing", 15, 142);
        text(gameApiStatus, 230, 30);
        text("Digits: " + digits + " Escapes: " + escapes, 230, 58);
        text("Actor checks ready", 230, 86);
        draw(imageActor); regionActor.draw(this); draw(animatedActor);
        draw(emptyActor);
        int legacyCalls = legacyActor.calls;
        draw(legacyActor);
        require(legacyActor.calls == legacyCalls + 1, "Legacy draw(GameApp) override dispatch");
        fill(Color.BLACK); stroke(Color.BLACK); strokeWidth(2); textSize(20);
        draw(rotatedShape); draw(straightShape); draw(nestedActor);
        boolean failed = false;
        try { draw(failingActor); } catch (IllegalStateException expected) { failed = true; }
        require(failed, "Expected actor draw failure");
        boolean unbound = false;
        try { failingActor.outside(); } catch (IllegalStateException expected) { unbound = true; }
        require(unbound, "Failing actor must release its context");
        rect(430, 190, 10, 10); outlineRect(445, 185, 12, 12);
        text("Actor scope restored", 230, 114);
        fill(Color.rgb(17, 99, 203)); rect(440, 330, 20, 20);
        textCentered("Centered", width() / 2, height() - 20);
        fill(Color.BLUE); rect(20, 170, 20, 20); circle(70, 180, 20);
        stroke(Color.BLACK); strokeWidth(2); outlineRect(90, 170, 20, 20); line(120, 170, 140, 190);
        image(sheet, 20, 220); image(sheet, 60, 220, 30, 30);
        image(region, 110, 220); image(region, 140, 220, 30, 30);
        image(animation, 190, 220); image(animation, 220, 220, 30, 30);
        imageCentered(sheet, 280, 235, 30, 30, 20);
        imageCentered(region, 320, 235, 30, 30, -20);
        imageCentered(sequence, 360, 235, 30, 30, 30);
        imageFlippedY(sheet, 40, 290, 40, 40);
        imageFlippedY(region, 110, 290, 40, 40);
        imageFlippedY(animation, 180, 290, 40, 40);
        if (mouseDown(MouseButton.PRIMARY)) circle(mouseX(), mouseY(), 6);
    }
    private void verifyActors() {
        Player player = new Player(sheet);
        require(player.x() == 10 && player.y() == 20 && player.width() == 24 && player.height() == 24
                && player.rotation() == 0, "Actor initial center, size and rotation");
        player.setPosition(20, 30); player.setSize(30, 18); player.setRotation(-90);
        player.moveForward(10, .5);
        near(player.x(), 20, "forward x"); near(player.y(), 25, "forward y");
        player.move(3, 4); player.rotate(450);
        near(player.rotation(), 0, "normalized rotation");
        player.face(23, 39); near(player.rotation(), 90, "clockwise facing");
        player.moveToward(23, 39, 4, 1);
        near(player.y(), 33, "bounded movement");
        player.moveToward(23, 39, 100, 1);
        require(player.x() == 23 && player.y() == 39, "Actor cannot overshoot");
        player.face(player.x(), player.y()); near(player.rotation(), 90, "same-position facing");
        player.moveForward(-2, 1); near(player.y(), 37, "signed forward speed");
        boolean invalid = false;
        try { player.setPosition(2, Double.NaN); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid && player.x() == 23 && player.y() == 37, "atomic invalid position");
        invalid = false;
        try { player.setSize(50, 0); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid && player.width() == 30 && player.height() == 18, "atomic invalid size");
        player.setImage(region); player.setImage(sheet);
        require(player.width() == 30 && player.height() == 18, "image replacement preserves explicit size");
        SpriteAnimation frames = new SpriteAnimation(2, region, imageRegion(sheet, 12, 0, 12, 12));
        player.setImage(frames); player.update(.5);
        require(player.updates == 1 && frames.frameIndex() == 1, "explicit subclass animation update");
        player.setImage(sheet); player.update(.5);
        require(frames.frameIndex() == 1, "replaced animation is detached");
        imageActor = player; imageActor.setPosition(275, 295);
        imageActor.setSize(24, 24); imageActor.setRotation(90);
        regionActor = new Actor(region, 320, 295);
        animatedActor = new Actor(frames, 365, 295);
        require(regionActor.width() == 12 && regionActor.height() == 12
                && animatedActor.width() == 12 && animatedActor.height() == 12, "Actor sprite natural size");
        regionActor.setSize(24, 24); animatedActor.setSize(24, 24);
    }
    private static void require(boolean condition, String name) {
        if (!condition) throw new IllegalStateException(name);
    }
    private static void near(double actual, double expected, String name) {
        require(Math.abs(actual - expected) < .000001, name);
    }
    private static final class Player extends Actor {
        private int updates;
        Player(Image image) { super(image, 10, 20); }
        @Override public void update(double seconds) { super.update(seconds); updates++; }
    }
    private static final class ShapeActor extends Actor {
        ShapeActor(double x, double y) { super(x, y); }
        @Override public void draw() {
            fill(zero.Color.BLUE); stroke(zero.Color.BLACK); strokeWidth(1); textSize(9);
            rect(-10, -4, 20, 8); outlineRect(-10, -4, 20, 8);
            line(-8, -2, 8, -2);
            fill(zero.Color.GOLD); circle(6, 0, 4);
            text("Actor shape", -12, -14); textCentered("C", 0, 16);
        }
    }
    private static final class FailingActor extends Actor {
        FailingActor() { super(440, 110); setRotation(30); }
        @Override public void draw() {
            fill(zero.Color.GOLD); strokeWidth(7); textSize(42); rect(-3, -3, 6, 6);
            throw new IllegalStateException("Expected shape failure");
        }
        void outside() { fill(zero.Color.BLUE); }
    }
    private static final class LegacyActor extends Actor {
        private int calls;
        LegacyActor() { super(0, 0); }
        @Override public void draw(GameApp app) {
            calls++; app.fill(zero.Color.GOLD); app.rect(420, 175, 10, 10);
        }
    }
    private static final class NestedActor extends Actor {
        private final GameApp owner;
        private final Actor child = new Actor(4, 0) {
            @Override public void draw() { fill(zero.Color.GOLD); circle(0, 0, 6); }
        };
        NestedActor(GameApp owner) { super(360, 170); this.owner = owner; setRotation(90); }
        @Override public void draw() {
            fill(zero.Color.BLUE); rect(-8, -8, 16, 16);
            owner.draw(child);
            fill(zero.Color.BLUE); rect(-1, -1, 2, 2);
        }
    }
    public static void main(String[] args) { launch(args); }
}
