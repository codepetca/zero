package zero;

import java.util.EnumSet;
import java.util.HashMap;
import java.util.Map;
import java.net.URL;
import java.nio.file.Path;
import javafx.animation.AnimationTimer;
import javafx.scene.Scene;
import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.image.Image;
import javafx.scene.input.KeyCode;
import javafx.scene.input.MouseButton;
import javafx.scene.layout.BorderPane;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.scene.text.TextAlignment;
import javafx.stage.Stage;

/**
 * Canvas app with explicit update and draw callbacks. Read or change this source when contributing to Zero.
 * settings configures the window; setup runs once after canvas creation,
 * before the window is shown.
 * Each frame calls update(seconds), then draw, on the JavaFX application thread.
 * Keep callbacks short: slow work blocks drawing and normal JavaFX controls.
 */
public abstract class GameApp extends App {
    private Canvas canvas;
    private BorderPane layout;
    private GraphicsContext graphics;
    private AnimationTimer timer;
    private final EnumSet<KeyCode> keys = EnumSet.noneOf(KeyCode.class);
    private final EnumSet<MouseButton> buttons = EnumSet.noneOf(MouseButton.class);
    private final EnumSet<KeyCode> pendingKeys = EnumSet.noneOf(KeyCode.class);
    private final EnumSet<KeyCode> pressedKeys = EnumSet.noneOf(KeyCode.class);
    private final EnumSet<MouseButton> pendingButtons = EnumSet.noneOf(MouseButton.class);
    private final EnumSet<MouseButton> pressedButtons = EnumSet.noneOf(MouseButton.class);
    private final Map<String, Image> imageCache = new HashMap<>();
    private Stage window;
    private double mouseX;
    private double mouseY;

    public void update(double seconds) { }
    public void draw() { }

    @Override protected final javafx.scene.Node createContent() {
        canvas = new Canvas(initialWidth(), initialHeight());
        canvas.setFocusTraversable(true);
        graphics = canvas.getGraphicsContext2D();
        layout = new BorderPane(canvas);
        canvas.addEventHandler(javafx.scene.input.KeyEvent.KEY_PRESSED, event -> {
            if (canvas.isFocused()) {
                if (keys.add(event.getCode())) pendingKeys.add(event.getCode());
                // Arrow movement belongs to the canvas; Tab still reaches native controls.
                if (event.getCode().isArrowKey()) event.consume();
            }
        });
        canvas.focusedProperty().addListener((property, wasFocused, focused) -> {
            if (!focused) clearInput();
        });
        mouseX = width() / 2;
        mouseY = height() / 2;
        return layout;
    }

    @Override protected final Scene createScene(BorderPane content) { return new Scene(content); }

    @Override protected final void ready(Stage stage) {
        window = stage;
        Scene scene = stage.getScene();
        // Release an owned input even when dragging outside the canvas.
        scene.addEventFilter(javafx.scene.input.KeyEvent.KEY_RELEASED,
                event -> keys.remove(event.getCode()));
        scene.addEventFilter(javafx.scene.input.MouseEvent.ANY, event -> {
            boolean onCanvas = event.getTarget() == canvas;
            if (onCanvas || !buttons.isEmpty()) {
                var point = canvas.sceneToLocal(event.getSceneX(), event.getSceneY());
                mouseX = point.getX();
                mouseY = point.getY();
            }
            if (event.getEventType() == javafx.scene.input.MouseEvent.MOUSE_PRESSED && onCanvas) {
                canvas.requestFocus();
                if (buttons.add(event.getButton())) pendingButtons.add(event.getButton());
            }
            if (event.getEventType() == javafx.scene.input.MouseEvent.MOUSE_RELEASED) {
                buttons.remove(event.getButton());
            }
        });
        stage.focusedProperty().addListener((property, wasFocused, focused) -> {
            if (!focused) clearInput();
        });
        canvas.requestFocus();
        timer = new AnimationTimer() {
            private long previous;
            @Override public void handle(long now) {
                double seconds = previous == 0 ? 0 : Math.min(0.1, (now - previous) / 1_000_000_000.0);
                previous = now;
                pressedKeys.clear(); pressedKeys.addAll(pendingKeys); pendingKeys.clear();
                pressedButtons.clear(); pressedButtons.addAll(pendingButtons); pendingButtons.clear();
                try {
                    update(seconds);
                    draw();
                } catch (RuntimeException | Error failure) {
                    // Preserve the useful frame error even if native cleanup also fails.
                    try { GameApp.this.stop(); }
                    catch (RuntimeException | Error cleanup) { failure.addSuppressed(cleanup); }
                    throw failure;
                } finally {
                    pressedKeys.clear(); pressedButtons.clear();
                }
            }
        };
        timer.start();
    }

    private void clearInput() {
        keys.clear(); buttons.clear(); pendingKeys.clear(); pendingButtons.clear();
        pressedKeys.clear(); pressedButtons.clear();
    }

    @Override protected final void shutdown() {
        if (timer != null) timer.stop();
        clearInput();
        imageCache.clear();
        window = null;
    }

    public final double width() { return canvas.getWidth(); }
    public final double height() { return canvas.getHeight(); }
    public final double mouseX() { return mouseX; }
    public final double mouseY() { return mouseY; }
    public final boolean keyDown(KeyCode key) { return keys.contains(key); }
    public final boolean mouseDown(MouseButton button) { return buttons.contains(button); }

    /** True throughout the next update/draw frame after an owned press; queries do not consume it. */
    public final boolean keyPressed(KeyCode key) { return pressedKeys.contains(key); }
    public final boolean mousePressed(MouseButton button) { return pressedButtons.contains(button); }
    /** Window focus, even when a native control rather than the canvas has keyboard focus. */
    public final boolean windowFocused() { return window != null && window.isFocused(); }

    /** Standard JavaFX escape hatches: call after the canvas is created. */
    public final Canvas canvas() { return canvas; }
    public final GraphicsContext graphics() { return graphics; }
    public final BorderPane layout() { return layout; }

    /** Clears the full canvas, retaining the current drawing styles. */
    public final void background(Color color) {
        graphics.save();
        graphics.setTransform(1, 0, 0, 1, 0, 0);
        graphics.clearRect(0, 0, width(), height());
        graphics.setFill(color);
        graphics.fillRect(0, 0, width(), height());
        graphics.restore();
    }
    public final void fill(Color color) { graphics.setFill(color); }
    public final void stroke(Color color) { graphics.setStroke(color); }
    public final void strokeWidth(double pixels) { graphics.setLineWidth(pixels); }
    public final void textSize(double pixels) { graphics.setFont(Font.font(pixels)); }
    public final void rect(double x, double y, double width, double height) { graphics.fillRect(x, y, width, height); }
    public final void outlineRect(double x, double y, double width, double height) { graphics.strokeRect(x, y, width, height); }
    public final void circle(double centreX, double centreY, double diameter) {
        graphics.fillOval(centreX - diameter / 2, centreY - diameter / 2, diameter, diameter);
    }
    public final void line(double x1, double y1, double x2, double y2) { graphics.strokeLine(x1, y1, x2, y2); }
    /** Text y is the baseline, following JavaFX conventions. */
    public final void text(String value, double x, double y) { graphics.fillText(value, x, y); }
    /** Centers horizontally; y keeps the current JavaFX text baseline convention. */
    public final void textCentered(String value, double x, double y) {
        graphics.save();
        try { graphics.setTextAlign(TextAlignment.CENTER); graphics.fillText(value, x, y); }
        finally { graphics.restore(); }
    }
    public final void image(Image image, double x, double y) { graphics.drawImage(image, x, y); }
    public final void image(Image image, double x, double y, double width, double height) {
        graphics.drawImage(image, x, y, width, height);
    }
    public final ImageRegion imageRegion(Image image, double x, double y, double width, double height) {
        return new ImageRegion(image, x, y, width, height);
    }
    public final void image(ImageRegion region, double x, double y) {
        image(region, x, y, region.width(), region.height());
    }
    public final void image(ImageRegion region, double x, double y, double width, double height) {
        graphics.drawImage(region.image(), region.x(), region.y(), region.width(), region.height(), x, y, width, height);
    }
    public final void image(SpriteAnimation animation, double x, double y) { image(animation.frame(), x, y); }
    public final void image(SpriteAnimation animation, double x, double y, double width, double height) {
        image(animation.frame(), x, y, width, height);
    }

    /** x/y are the destination centre; rotation is in degrees about that centre. */
    public final void imageCentered(Image image, double x, double y, double width, double height, double angleDegrees) {
        graphics.save();
        try { graphics.translate(x, y); graphics.rotate(angleDegrees); image(image, -width / 2, -height / 2, width, height); }
        finally { graphics.restore(); }
    }
    public final void imageCentered(ImageRegion region, double x, double y, double width, double height, double angleDegrees) {
        graphics.save();
        try { graphics.translate(x, y); graphics.rotate(angleDegrees); image(region, -width / 2, -height / 2, width, height); }
        finally { graphics.restore(); }
    }
    public final void imageCentered(SpriteAnimation animation, double x, double y, double width, double height, double angleDegrees) {
        imageCentered(animation.frame(), x, y, width, height, angleDegrees);
    }
    /** Flip vertically inside the destination rectangle whose top-left is x/y. */
    public final void imageFlippedY(Image image, double x, double y, double width, double height) {
        graphics.save();
        try { graphics.translate(x, y + height); graphics.scale(1, -1); image(image, 0, 0, width, height); }
        finally { graphics.restore(); }
    }
    public final void imageFlippedY(ImageRegion region, double x, double y, double width, double height) {
        graphics.save();
        try { graphics.translate(x, y + height); graphics.scale(1, -1); image(region, 0, 0, width, height); }
        finally { graphics.restore(); }
    }
    public final void imageFlippedY(SpriteAnimation animation, double x, double y, double width, double height) {
        imageFlippedY(animation.frame(), x, y, width, height);
    }

    /** Loads a bundled resource once per app (for example /player.png in src/main/resources). */
    public final Image loadImage(String resourcePath) {
        var resource = getClass().getResource(resourcePath);
        if (resource == null) throw new IllegalArgumentException("Image resource not found: " + resourcePath);
        String key = imageResourceKey(resource);
        Image cached = imageCache.get(key);
        if (cached != null) return cached;
        Image image = new Image(resource.toExternalForm());
        if (image.isError()) throw new IllegalArgumentException("Cannot load image: " + resourcePath, image.getException());
        ImageRegion.requireLoaded(image);
        imageCache.put(key, image);
        return image;
    }
    public final SpriteAnimation loadAnimation(String resourcePath, int columns, int rows, double fps) {
        return new SpriteAnimation(loadImage(resourcePath), columns, rows, fps);
    }
    private static String imageResourceKey(URL resource) {
        try {
            if (resource.getProtocol().equals("file")) return Path.of(resource.toURI()).toRealPath().toUri().toString();
            // Normalize dot-segment aliases inside JAR resource URLs as well.
            if (resource.getProtocol().equals("jar")) {
                String url = resource.toExternalForm();
                int separator = url.indexOf("!/");
                return url.substring(0, separator + 1) + new java.net.URI(url.substring(separator + 1)).normalize();
            }
            return resource.toURI().normalize().toString();
        } catch (java.io.IOException | java.net.URISyntaxException failure) {
            throw new IllegalArgumentException("Cannot resolve image resource: " + resource, failure);
        }
    }
}
