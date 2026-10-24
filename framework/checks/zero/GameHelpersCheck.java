package zero;

import java.nio.file.Files;
import java.nio.file.Path;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import javafx.application.Platform;
import javafx.event.Event;
import javafx.geometry.VPos;
import javafx.scene.control.TextField;
import javafx.scene.image.Image;
import javafx.scene.image.WritableImage;
import javafx.scene.input.*;
import javafx.scene.paint.Color;
import javafx.scene.text.TextAlignment;
import javafx.stage.Stage;

/** Finite checks delivered through the real AnimationTimer update/draw loop. */
public final class GameHelpersCheck extends GameApp {
    private int phase;
    private long phaseStarted;
    private TextField field;
    private Stage other;
    private Image cached;
    @Override public void settings() { size(160, 120); title("Zero game helper checks"); }
    @Override public void setup() {
        phaseStarted = System.nanoTime();
        for (Runnable query : new Runnable[] {() -> keyDown((Key) null), () -> keyPressed((Key) null)}) {
            try { query.run(); throw new AssertionError("Null Zero key accepted"); }
            catch (NullPointerException expected) { require("Key must not be null.".equals(expected.getMessage()), "useful null key error"); }
        }
        field = new TextField(); layout().setBottom(field);
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_GAME_HELPERS_TIMEOUT phase=" + phase); System.exit(1);
        });
        watchdog.setDaemon(true); watchdog.start();
    }
    @Override public void update(double seconds) {
        try {
            switch (phase) {
                case 0:
                    if (!NativeFocus.await(canvas(), phaseStarted, "game helper canvas focus")) return;
                    verifyImages(); verifyDrawing(); verifyCollisions();
                    for (Key arrow : Key.values()) {
                        key(canvas(), KeyEvent.KEY_PRESSED, arrow.fxKeyCode());
                        require(keyDown(arrow) && keyDown(arrow.fxKeyCode()), "Zero arrow shares native held state: " + arrow);
                        key(canvas(), KeyEvent.KEY_RELEASED, arrow.fxKeyCode());
                        require(!keyDown(arrow), "Zero arrow release: " + arrow);
                    }
                    key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.SPACE);
                    key(canvas(), KeyEvent.KEY_RELEASED, KeyCode.SPACE);
                    mouse(MouseEvent.MOUSE_PRESSED); mouse(MouseEvent.MOUSE_RELEASED);
                    require(!keyDown(KeyCode.SPACE) && !mouseDown(MouseButton.PRIMARY), "between-frame release state");
                    require(!keyPressed(KeyCode.SPACE) && !mousePressed(MouseButton.PRIMARY), "new edges wait for next frame");
                    phase = 1; break;
                case 1:
                    for (Key arrow : Key.values()) require(keyPressed(arrow) && keyPressed(arrow), "Zero arrow edge is non-consuming in update");
                    require(keyPressed(KeyCode.SPACE) && keyPressed(KeyCode.SPACE), "key edge non-consuming in update");
                    require(mousePressed(MouseButton.PRIMARY) && mousePressed(MouseButton.PRIMARY), "mouse edge non-consuming in update");
                    break;
                case 2:
                    for (Key arrow : Key.values()) require(!keyPressed(arrow), "Zero arrow edge expires after complete frame");
                    key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.LEFT); key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.LEFT);
                    require(!keyPressed(KeyCode.SPACE) && !mousePressed(MouseButton.PRIMARY), "edges expire after complete frame");
                    key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.A); key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.A);
                    phase = 3; break;
                case 3:
                    require(keyDown(Key.LEFT) && keyPressed(Key.LEFT) && keyPressed(Key.LEFT), "Zero held/edge overloads share existing frame ownership");
                    require(keyPressed(KeyCode.A) && keyDown(KeyCode.A), "new held press delivered in update");
                    break;
                case 4:
                    require(keyDown(Key.LEFT) && !keyPressed(Key.LEFT), "Zero auto-repeat does not create another edge");
                    key(canvas(), KeyEvent.KEY_RELEASED, KeyCode.LEFT);
                    key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.RIGHT);
                    require(keyDown(KeyCode.A) && !keyPressed(KeyCode.A), "auto-repeat does not create edges");
                    key(canvas(), KeyEvent.KEY_RELEASED, KeyCode.A);
                    key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.B); mouse(MouseEvent.MOUSE_PRESSED);
                    field.requestFocus();
                    require(windowFocused(), "native control focus retains window focus");
                    require(!keyDown(KeyCode.B) && !mouseDown(MouseButton.PRIMARY), "canvas focus loss clears held input");
                    require(!keyDown(Key.RIGHT) && !keyPressed(Key.RIGHT), "control focus clears Zero held and edge state");
                    phase = 5; break;
                case 5:
                    require(!keyPressed(KeyCode.B) && !mousePressed(MouseButton.PRIMARY), "canvas focus loss clears pending edges");
                    field.setText("abc"); field.positionCaret(0);
                    key(field, KeyEvent.KEY_PRESSED, KeyCode.RIGHT);
                    require(field.getCaretPosition() == 1 && !keyDown(KeyCode.RIGHT) && !keyPressed(KeyCode.RIGHT), "native arrow caret behavior");
                    require(!keyDown(Key.RIGHT) && !keyPressed(Key.RIGHT), "control typing does not enter Zero input state");
                    canvas().requestFocus(); key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.C); mouse(MouseEvent.MOUSE_PRESSED);
                    other = new Stage(); other.setScene(new javafx.scene.Scene(new TextField(), 100, 60)); other.show(); other.requestFocus();
                    phase = 6; break;
                case 6:
                    if (windowFocused()) { other.requestFocus(); return; }
                    require(!keyDown(KeyCode.C) && !keyPressed(KeyCode.C) && !mouseDown(MouseButton.PRIMARY)
                            && !mousePressed(MouseButton.PRIMARY), "window focus loss clears all input");
                    other.close();
                    phaseStarted = System.nanoTime();
                    canvas().getScene().getWindow().requestFocus(); canvas().requestFocus(); phase = 7; break;
                case 7:
                    if (!NativeFocus.await(canvas(), phaseStarted, "game helper restored canvas focus")) return;
                    require(!keyPressed(KeyCode.C) && !mousePressed(MouseButton.PRIMARY), "regaining focus does not replay edges");
                    key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.D); mouse(MouseEvent.MOUSE_PRESSED);
                    stop();
                    require(!keyDown(KeyCode.D) && !keyPressed(KeyCode.D) && !mouseDown(MouseButton.PRIMARY)
                            && !mousePressed(MouseButton.PRIMARY) && !windowFocused(), "stop clears input and focus");
                    require(cached != loadImage("/zero/helper-sheet.png"), "shutdown clears image cache");
                    System.out.println("ZERO_GAME_HELPERS_OK input frames/focus, image sharing/validation/timing, transforms/pixels/text, collisions");
                    Platform.exit(); break;
            }
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }
    @Override public void draw() {
        if (phase == 1) {
            // The phase is set during update, so this first draw precedes edge delivery.
            if (!keyPressed(KeyCode.SPACE)) return;
            require(keyPressed(KeyCode.SPACE) && keyPressed(KeyCode.SPACE), "key edge non-consuming in draw");
            for (Key arrow : Key.values()) require(keyPressed(arrow) && keyPressed(arrow), "Zero arrow edge is non-consuming in draw");
            require(mousePressed(MouseButton.PRIMARY) && mousePressed(MouseButton.PRIMARY), "mouse edge non-consuming in draw");
            phase = 2;
        } else if (phase == 3 && keyPressed(KeyCode.A)) {
            require(keyDown(KeyCode.A), "held press after edge delivery");
            key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.A); phase = 4;
        }
    }
    private void verifyImages() throws Exception {
        Path resources = Path.of(getClass().getResource("/").toURI());
        Path sheet = resources.resolve("zero/helper-sheet.png");
        BufferedImage bitmap = new BufferedImage(8, 4, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < 4; y++) for (int x = 0; x < 8; x++) bitmap.setRGB(x, y, y < 2 ? 0xffff0000 : 0xff0000ff);
        ImageIO.write(bitmap, "png", sheet.toFile());
        cached = loadImage("/zero/helper-sheet.png");
        require(cached == loadImage("helper-sheet.png") && cached == loadImage("/zero/../zero/helper-sheet.png"), "canonical resource aliases share bitmap");
        ImageRegion fullImage = loadImageRegion("/zero/helper-sheet.png");
        require(fullImage.x() == 0 && fullImage.y() == 0 && fullImage.width() == 8 && fullImage.height() == 4
                && fullImage.image() == cached, "full-image region shares cached image and exact bounds");
        require(loadImageRegion("helper-sheet.png").image() == cached
                && loadImageRegion("/zero/../zero/helper-sheet.png").image() == cached, "full-image region aliases share backing pixels");
        try { loadImageRegion(null); throw new AssertionError("Null image-region path accepted"); }
        catch (NullPointerException expected) { require("Image resource path must not be null.".equals(expected.getMessage()), "useful null image-region error"); }
        try { loadImageRegion("/zero/missing.png"); throw new AssertionError("Missing image-region path accepted"); }
        catch (IllegalArgumentException expected) { require(expected.getMessage().contains("/zero/missing.png"), "missing image-region error names resource"); }
        SpriteAnimation first = loadAnimation("/zero/helper-sheet.png", 4, 2, 8);
        SpriteAnimation second = loadAnimation("helper-sheet.png", 4, 2, 8);
        require(first.image() == cached && second.image() == cached, "animations share cached bitmap");
        ImageRegion initial = first.frame();
        first.update(0.125); require(first.frameIndex() == 1 && second.frameIndex() == 0, "independent explicit timers");
        first.update(0.25); require(first.frameIndex() == 3, "multiple frame advance");
        first.update(0.625); require(first.frameIndex() == 0 && first.frame() == initial, "loop reuses frame regions");
        first.update(Double.MAX_VALUE); require(first.frameIndex() >= 0 && first.frameIndex() < 8, "large delta remains valid");
        first.reset(); require(first.frame() == initial, "reset reuses first frame");
        require(first.frameCount() == 8 && first.columns() == 4 && first.rows() == 2 && first.fps() == 8, "animation metadata");
        SpriteAnimation hugeRate = new SpriteAnimation(cached, 4, 2, Double.MAX_VALUE);
        hugeRate.update(Double.MAX_VALUE); require(hugeRate.frame() != null, "overflow-safe rate and delta");
        SpriteAnimation tinyRate = new SpriteAnimation(cached, 4, 2, Double.MIN_VALUE);
        tinyRate.update(Double.MAX_VALUE); require(tinyRate.frameIndex() == 0, "tiny rate remains stable");
        ImageRegion region = imageRegion(cached, 2, 1, 2, 2);
        require(region.image() == cached && region.x() == 2 && region.y() == 1 && region.width() == 2 && region.height() == 2, "region source coordinates");
        ImageRegion[] sequence = {initial, region};
        SpriteAnimation irregular = new SpriteAnimation(2, sequence); sequence[0] = region;
        require(irregular.frame() == initial && irregular.columns() == 2 && irregular.rows() == 1, "explicit sequence copies descriptors only");
        irregular.update(0.5); require(irregular.frame() == region, "explicit sequence timing");
        invalid(() -> imageRegion(cached, -1, 0, 1, 1)); invalid(() -> imageRegion(cached, 0, 0, 0, 1));
        invalid(() -> imageRegion(cached, 7, 0, 2, 1)); invalid(() -> imageRegion(cached, Double.NaN, 0, 1, 1));
        invalid(() -> new SpriteAnimation(cached, 3, 2, 4)); invalid(() -> new SpriteAnimation(cached, 0, 1, 4));
        invalid(() -> new SpriteAnimation(cached, Integer.MAX_VALUE, 2, 4));
        for (double bad : new double[] {0, -1, Double.NaN, Double.POSITIVE_INFINITY}) invalid(() -> new SpriteAnimation(cached, 1, 1, bad));
        for (double bad : new double[] {-1, Double.NaN, Double.POSITIVE_INFINITY}) invalid(() -> first.update(bad));
        invalid(() -> new SpriteAnimation(2)); invalid(() -> new SpriteAnimation(2, initial, imageRegion(cached, 0, 0, 4, 4)));
        invalid(() -> new SpriteAnimation(2, initial, new ImageRegion(new WritableImage(2, 2), 0, 0, 2, 2)));
        invalid(() -> loadImage("/zero/missing.png"));
        Path retry = resources.resolve("zero/retry.png"); Files.writeString(retry, "broken image");
        invalid(() -> loadImage("/zero/retry.png"));
        Files.copy(sheet, retry, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        require(loadImage("/zero/retry.png").getWidth() == 8, "failed image loads are not cached");
        GameApp another = new GameApp() { };
        require(another.loadImage("/zero/helper-sheet.png") != cached, "cache belongs to each app"); another.stop();
    }
    private void verifyDrawing() {
        background(Color.WHITE);
        graphics().setImageSmoothing(false);
        imageFlippedY(cached, 10, 10, 40, 40);
        imageFlippedY(new ImageRegion(cached, 0, 0, 4, 4), 60, 10, 40, 40);
        imageCentered(new SpriteAnimation(cached, 1, 1, 1), 30, 80, 40, 40, 180);
        image(loadImageRegion("/zero/helper-sheet.png"), 110, 65, 40, 40);
        WritableImage pixels = canvas().snapshot(null, null);
        require(pixels.getPixelReader().getColor(20, 15).equals(Color.BLUE), "image flipped top pixels");
        require(pixels.getPixelReader().getColor(70, 45).equals(Color.RED), "region flipped bottom pixels");
        require(pixels.getPixelReader().getColor(20, 65).equals(Color.BLUE), "animation centered and rotated pixels");
        require(pixels.getPixelReader().getColor(115, 70).equals(Color.RED)
                && pixels.getPixelReader().getColor(115, 100).equals(Color.BLUE), "full-image region scales complete image to destination bounds");
        graphics().translate(3, 7); graphics().rotate(12); graphics().setGlobalAlpha(0.6);
        fill(Color.GREEN); textSize(18); graphics().setTextAlign(TextAlignment.RIGHT); graphics().setTextBaseline(VPos.BASELINE);
        var transform = graphics().getTransform(); var font = graphics().getFont();
        ImageRegion region = new ImageRegion(cached, 0, 0, 4, 4); SpriteAnimation animation = new SpriteAnimation(cached, 1, 1, 2);
        imageCentered(cached, 20, 20, 8, 8, 30); imageCentered(region, 20, 20, 8, 8, 30); imageCentered(animation, 20, 20, 8, 8, 30);
        imageFlippedY(cached, 20, 20, 8, 8); imageFlippedY(region, 20, 20, 8, 8); imageFlippedY(animation, 20, 20, 8, 8);
        image(region, 0, 0); image(animation, 0, 0); image(region, 0, 0, 8, 8); image(animation, 0, 0, 8, 8);
        textCentered("hello", 30, 30);
        require(java.util.Arrays.equals(transform.toArray(javafx.scene.transform.MatrixType.MT_2D_2x3),
                graphics().getTransform().toArray(javafx.scene.transform.MatrixType.MT_2D_2x3)), "helpers restore transform");
        require(graphics().getFill().equals(Color.GREEN) && graphics().getFont().equals(font)
                && graphics().getGlobalAlpha() == 0.6 && graphics().getTextAlign() == TextAlignment.RIGHT
                && graphics().getTextBaseline() == VPos.BASELINE, "helpers restore styles");
    }
    private void verifyCollisions() {
        require(Collisions.circleHitsRect(0, 0, 5, 3, 4, 10, 10), "circle rectangle corner touches");
        require(!Collisions.circleHitsRect(0, 0, 4.9, 3, 4, 10, 10), "circle rectangle corner misses");
        require(Collisions.circleHitsRect(4, 5, 0, 0, 0, 10, 10), "point inside rectangle");
        require(Collisions.rectHitsRect(0, 0, 2, 2, 2, 2, 3, 3), "rectangle corners touch");
        require(!Collisions.rectHitsRect(0, 0, 2, 2, 2.1, 0, 3, 3), "separated rectangles");
        require(Collisions.circleHitsCircle(0, 0, 2, 3, 4, 3), "circle edges touch");
        require(!Collisions.circleHitsCircle(0, 0, 2, 3, 4, 2.9), "separated circles");
        require(Collisions.circleHitsCircle(Double.MAX_VALUE, 0, Double.MAX_VALUE, -Double.MAX_VALUE, 0, Double.MAX_VALUE), "large circle tangent avoids overflow");
        require(Collisions.circleHitsRect(Double.MAX_VALUE, 0, Double.MAX_VALUE,
                -Double.MAX_VALUE, 0, Double.MAX_VALUE, 0), "large circle rectangle tangent avoids intermediate overflow");
        invalid(() -> Collisions.circleHitsRect(0, 0, -1, 0, 0, 1, 1));
        invalid(() -> Collisions.rectHitsRect(0, 0, 1, 1, Double.NaN, 0, 1, 1));
        invalid(() -> Collisions.circleHitsCircle(0, 0, 1, 0, 0, Double.POSITIVE_INFINITY));
    }
    private static void invalid(Runnable action) {
        try { action.run(); throw new AssertionError("invalid argument accepted"); }
        catch (IllegalArgumentException expected) { require(expected.getMessage() != null && !expected.getMessage().isBlank(), "useful validation message"); }
    }
    private static void key(javafx.scene.Node target, javafx.event.EventType<KeyEvent> type, KeyCode code) {
        Event.fireEvent(target, new KeyEvent(type, "", "", code, false, false, false, false));
    }
    private void mouse(javafx.event.EventType<MouseEvent> type) {
        Event.fireEvent(canvas(), new MouseEvent(type, 10, 10, 10, 10, MouseButton.PRIMARY, 1,
                false, false, false, false, type == MouseEvent.MOUSE_PRESSED, false, false,
                false, false, false, new PickResult(canvas(), 10, 10)));
    }
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    public static void main(String[] args) { launch(args); }
}
