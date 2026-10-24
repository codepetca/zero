package zero;

import javafx.application.Platform;
import javafx.scene.image.Image;
import javafx.scene.image.WritableImage;
import javafx.scene.paint.Color;
import javafx.stage.Stage;

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
            verifyMovement(); verifyImagesAndInheritance(); verifyPlaybackContract(); verifyPixels();
            verifyDrawingCallbacks(); verifyNestedDrawing(); verifyDrawingMisuse();
            System.out.println("ZERO_ACTOR_OK movement/aiming/clamping, validation/atomicity, sprites, local shape pixels, isolated styles, nested apps and failure cleanup");
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
        position(player, 35, 40); require(walk.frameIndex() == 0, "actor update owns a separate clock without subclass super");
        player.draw(this); player.draw(this);
        draw(player); draw(player);
        require(walk.frameIndex() == 0, "drawing does not advance animation");
        unchanged(player, () -> player.update(-1));
        player.setImage(sheet); player.update(1);
        require(walk.frameIndex() == 0, "replaced animation stops advancing");
        player.setImage(region); player.setImage(walk);
        position(player, 45, 40);
        near(player.width(), 20, "replacement preserves display width");
        near(player.height(), 30, "replacement preserves display height");
        near(player.rotation(), 15, "replacement preserves rotation");
        player.setImage(new SpriteAnimation(sheet, 2, 1, 2)); player.update(0);
        require(walk.frameIndex() == 0, "new animation has independent clock");
        near(new Actor(region, 0, 0).width(), 2, "region natural size");
        near(new Actor(walk, 0, 0).height(), 2, "animation natural size");
        expectNull(() -> player.setImage((Image) null));
        expectNull(() -> player.setImage((ImageRegion) null));
        expectNull(() -> player.setImage((SpriteAnimation) null));
        expectNull(() -> player.draw(null));
    }

    private void verifyPlaybackContract() {
        WritableImage pixels = new WritableImage(4, 2);
        for (int y = 0; y < 2; y++) for (int x = 0; x < 4; x++) pixels.getPixelWriter().setColor(x, y, x < 2 ? Color.RED : Color.BLUE);
        ImageRegion first = new ImageRegion(pixels, 0, 0, 2, 2), second = new ImageRegion(pixels, 2, 0, 2, 2);
        SpriteAnimation definition = new SpriteAnimation(2, first, second);
        AnimationPlayback left = definition.createPlayback(), right = definition.createPlayback();
        require(left != right && left.frame() == right.frame(), "fresh clocks share immutable frame definitions");
        left.update(.5); require(left.frame() == second && right.frame() == first, "factory clocks are independent");
        definition.update(.5); require(definition.frameIndex() == 1 && right.frame() == first, "legacy clock stays independent");
        require(definition.createPlayback().frame() == first, "factory always starts at zero, regardless of legacy position");
        definition.reset(); require(definition.frameIndex() == 0 && left.frame() == second, "legacy reset never resets actor playback");
        for (double bad : new double[] {-1, Double.NaN, Double.POSITIVE_INFINITY}) expectIllegal(() -> left.update(bad));
        ProbeSource source = new ProbeSource(first, second);
        HookActor actor = new HookActor(source, 20, 20);
        actor.setSize(20, 20); actor.setRotation(25);
        ProbePlayback owned = source.last;
        require(source.created == 1, "actor calls factory exactly once");
        actor.update(0); require(actor.hooks == 1 && owned.updates == 1 && owned.seconds == 0, "zero seconds follows normal sequence");
        for (double bad : new double[] {-1, Double.NaN, Double.POSITIVE_INFINITY}) {
            expectIllegal(() -> actor.update(bad));
            require(actor.hooks == 1 && owned.updates == 1, "invalid time is rejected before behaviour and playback");
        }
        actor.action = () -> { throw new IllegalStateException("hook failure"); };
        try { actor.update(.5); throw new AssertionError("Hook failure swallowed"); }
        catch (IllegalStateException expected) { require(expected.getMessage().equals("hook failure"), "original hook failure preserved"); }
        require(owned.updates == 1, "failed behaviour does not advance playback");
        ProbeSource replacement = new ProbeSource(first, second);
        actor.action = () -> actor.setImage(replacement);
        actor.update(.5); actor.action = null;
        require(owned.updates == 1 && replacement.created == 1 && replacement.last.updates == 1
                && replacement.last.seconds == .5, "hook replacement selects the one playback advanced that frame");
        position(actor, 20, 20); near(actor.width(), 20, "animation keeps width"); near(actor.height(), 20, "animation keeps height"); near(actor.rotation(), 25, "animation keeps rotation");
        ProbePlayback selected = replacement.last;
        for (AnimationSource broken : new AnimationSource[] {() -> null, () -> new AnimationPlayback() {
            public void update(double seconds) { }
            public ImageRegion frame() { return null; }
        }}) {
            try { actor.setImage(broken); throw new AssertionError("Invalid playback accepted"); }
            catch (IllegalStateException expected) { require(expected.getMessage().contains("Animation"), "useful component failure"); }
        }
        position(actor, 20, 20); near(actor.width(), 20, "failed replacement keeps dimensions"); near(actor.rotation(), 25, "failed replacement keeps heading");
        actor.update(0); require(selected.updates == 2, "failed replacement preserves selected clock");
        int frameReads = selected.frameReads;
        background(Color.WHITE); actor.draw(this); draw(actor);
        require(selected.updates == 2 && selected.frameReads == frameReads, "repeated drawing observes cached frame without querying or advancing playback");
        require(canvas().snapshot(null, null).getPixelReader().getColor(20,20).equals(Color.BLUE), "owned playback frame is rendered");
        selected.badFrame = true;
        try { actor.update(0); throw new AssertionError("Invalid updated frame accepted"); }
        catch (IllegalStateException expected) { require(expected.getMessage().contains("frame()"), "updated frame failure names contract"); }
        selected.badFrame = false;
        actor.action = () -> actor.setImage(first); actor.update(.5); actor.action = null;
        require(selected.updates == 3, "static image chosen during behaviour detaches old playback before advancement");
        background(Color.WHITE); draw(actor);
        require(canvas().snapshot(null, null).getPixelReader().getColor(20,20).equals(Color.RED), "static image replaces cached frame");
        actor.setImage(source); require(source.last != owned && source.last.frame() == first, "reapplying a source restarts with a fresh clock");
        expectNull(() -> actor.setImage((AnimationSource) null));
        expectNull(() -> new Actor((AnimationSource) null, 0, 0));
        // Conformance probes run outside Actor: production does not call factories twice or keep a global owner registry.
        require(fresh(definition), "default source conforms");
        AnimationPlayback cached = definition.createPlayback();
        require(!fresh(() -> cached), "cached playback source fails freshness conformance");
        pause(); int before = source.last.updates; draw(actor); draw(actor);
        require(source.last.updates == before && isPaused(), "paused rendering does not advance clocks");
        resume(); actor.update(.25); require(source.last.updates == before + 1, "explicit update resumes owned playback");
    }
    private static boolean fresh(AnimationSource source) { return source.createPlayback() != source.createPlayback(); }
    private static final class ProbeSource implements AnimationSource {
        private final ImageRegion first, second;
        private ProbePlayback last;
        private int created;
        ProbeSource(ImageRegion first, ImageRegion second) { this.first = first; this.second = second; }
        public AnimationPlayback createPlayback() { created++; last = new ProbePlayback(first, second); return last; }
    }
    private static final class ProbePlayback implements AnimationPlayback {
        private final ImageRegion first, second;
        private int updates;
        private double seconds;
        private boolean badFrame;
        private int frameReads;
        ProbePlayback(ImageRegion first, ImageRegion second) { this.first = first; this.second = second; }
        public void update(double seconds) { updates++; this.seconds += seconds; }
        public ImageRegion frame() { frameReads++; return badFrame ? null : seconds >= .5 ? second : first; }
    }
    private static final class HookActor extends Actor {
        private int hooks;
        private Runnable action;
        HookActor(AnimationSource source, double x, double y) { super(source, x, y); }
        @Override protected void onUpdate(double seconds) { hooks++; if (action != null) action.run(); }
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

    private void verifyDrawingCallbacks() {
        Actor blank = new Actor(70, 30);
        position(blank, 70, 30); near(blank.width(), 1, "blank logical width"); near(blank.height(), 1, "blank logical height");
        blank.setSize(20, 20);
        for (double bad : new double[] {Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            expectIllegal(() -> new Actor(bad, 0)); expectIllegal(() -> new Actor(0, bad));
        }
        Actor shape = new Actor(30, 30) {
            @Override public void draw() {
                fill(zero.Color.BLUE); rect(-12, -4, 24, 8);
                stroke(zero.Color.BLACK); strokeWidth(5); textSize(27);
                line(-4, 20, 4, 20);
                fill(zero.Color.GOLD); circle(6, 0, 4);
            }
        };
        shape.setRotation(90);
        Actor sibling = new Actor(60, 60) {
            @Override public void draw() { rect(-4, -4, 8, 8); }
        };
        background(Color.WHITE); fill(Color.GREEN); stroke(Color.BLACK); strokeWidth(1); textSize(12);
        draw(shape); draw(sibling); draw(blank); rect(80, 5, 10, 10);
        require(graphics().getLineWidth() == 1 && graphics().getFont().getSize() == 12
                && graphics().getStroke().equals(Color.BLACK), "actor restores native stroke and font settings");
        WritableImage pixels = canvas().snapshot(null, null);
        color(pixels, 30, 22, Color.BLUE); color(pixels, 30, 36, Color.GOLD);
        color(pixels, 10, 30, Color.BLACK); color(pixels, 20, 30, Color.WHITE);
        color(pixels, 60, 60, Color.GREEN); color(pixels, 85, 10, Color.GREEN);
        color(pixels, 70, 30, Color.WHITE);

        WritableImage image = new WritableImage(2, 2);
        for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) image.getPixelWriter().setColor(x, y, Color.BLUE);
        Actor sprite = new Actor(image, 30, 80);
        sprite.setSize(10, 10); draw(sprite);
        Actor legacy = new Actor(0, 0) {
            @Override public void draw(GameApp app) { app.fill(Color.BLUE); app.rect(80, 75, 10, 10); }
            @Override public void draw() { throw new AssertionError("Legacy draw(app) override was bypassed"); }
        };
        draw(legacy);
        pixels = canvas().snapshot(null, null);
        color(pixels, 30, 80, Color.BLUE); color(pixels, 85, 80, Color.BLUE);
    }

    private void verifyNestedDrawing() {
        Actor child = new Actor(12, 0) {
            @Override public void draw() { fill(zero.Color.GOLD); circle(0, 0, 6); }
        };
        Actor parent = new Actor(30, 30) {
            @Override public void draw() {
                fill(zero.Color.BLUE); rect(-4, -4, 8, 8);
                ActorCheck.this.draw(child);
                rect(0, 10, 6, 6);
            }
        };
        background(Color.WHITE); fill(Color.GREEN); draw(parent); rect(80, 5, 10, 10);
        WritableImage pixels = canvas().snapshot(null, null);
        color(pixels, 30, 30, Color.BLUE); color(pixels, 42, 30, Color.GOLD);
        color(pixels, 32, 42, Color.BLUE); color(pixels, 85, 10, Color.GREEN);
        expectState(() -> child.circle(0, 0, 2));
        expectState(() -> parent.rect(0, 0, 2, 2));

        GameApp other = new GameApp() { @Override public void settings() { size(120, 100); } };
        Stage stage = new Stage();
        try {
            other.start(stage);
            other.background(Color.WHITE); other.fill(Color.BLUE);
            Actor crossing = new Actor(20, 20) {
                private boolean inner;
                @Override public void draw() {
                    if (inner) {
                        fill(zero.Color.BLACK); circle(0, 0, 6);
                        throw new IllegalStateException("Expected inner drawing failure");
                    }
                    fill(zero.Color.BLUE); rect(-4, -4, 8, 8);
                    inner = true;
                    try {
                        other.draw(this);
                        throw new AssertionError("Inner drawing failure was swallowed");
                    } catch (IllegalStateException expected) {
                        require(expected.getMessage().equals("Expected inner drawing failure"), "original inner drawing error survives");
                    } finally { inner = false; }
                    fill(zero.Color.GOLD); rect(6, -3, 6, 6);
                }
            };
            background(Color.WHITE); fill(Color.GREEN); draw(crossing); rect(80, 5, 10, 10);
            other.rect(80, 5, 10, 10);
            pixels = canvas().snapshot(null, null);
            color(pixels, 20, 20, Color.BLUE); color(pixels, 28, 20, Color.GOLD); color(pixels, 85, 10, Color.GREEN);
            WritableImage otherPixels = other.canvas().snapshot(null, null);
            color(otherPixels, 20, 20, Color.BLACK); color(otherPixels, 28, 20, Color.WHITE); color(otherPixels, 85, 10, Color.BLUE);
            expectState(() -> crossing.fill(zero.Color.BLUE));
        } finally { other.stop(); stage.close(); }

        Actor broken = new Actor(20, 70) {
            @Override public void draw() {
                fill(zero.Color.BLUE); strokeWidth(9); textSize(30); rect(-3, -3, 6, 6);
                throw new IllegalStateException("Expected actor drawing failure");
            }
        };
        background(Color.WHITE); fill(Color.GREEN); strokeWidth(1); textSize(12);
        try { draw(broken); throw new AssertionError("Actor drawing failure was swallowed"); }
        catch (IllegalStateException expected) { require(expected.getMessage().equals("Expected actor drawing failure"), "original drawing error survives"); }
        rect(80, 5, 10, 10);
        pixels = canvas().snapshot(null, null);
        color(pixels, 20, 70, Color.BLUE); color(pixels, 85, 10, Color.GREEN);
        require(graphics().getLineWidth() == 1 && graphics().getFont().getSize() == 12, "failure restores native drawing styles");
        expectState(() -> broken.fill(zero.Color.BLUE));
    }

    private void verifyDrawingMisuse() {
        Actor actor = new Actor(0, 0);
        for (Runnable helper : new Runnable[] {
                () -> actor.fill(zero.Color.BLUE), () -> actor.stroke(zero.Color.BLACK),
                () -> actor.strokeWidth(1), () -> actor.textSize(12),
                () -> actor.rect(0, 0, 2, 2), () -> actor.outlineRect(0, 0, 2, 2),
                () -> actor.circle(0, 0, 2), () -> actor.line(0, 0, 2, 2),
                () -> actor.text("Hello", 0, 0), () -> actor.textCentered("Hello", 0, 0), actor::draw}) expectState(helper);
        expectNull(() -> draw((Actor) null));
        expectState(() -> new GameApp() { }.draw(actor));
    }

    private static final class Player extends Actor {
        Player(SpriteAnimation animation, double x, double y) { super(animation, x, y); }
        @Override protected void onUpdate(double seconds) {
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
    private static void expectIllegal(Runnable action) {
        try { action.run(); throw new AssertionError("Expected invalid Actor argument"); }
        catch (IllegalArgumentException expected) { }
    }
    private static void expectState(Runnable action) {
        try { action.run(); throw new AssertionError("Expected Actor drawing scope error"); }
        catch (IllegalStateException expected) { require(expected.getMessage().contains("draw") || expected.getMessage().contains("Draw"), "useful Actor drawing scope error"); }
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
