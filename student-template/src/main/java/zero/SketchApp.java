package zero;

import java.util.EnumSet;
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
import javafx.stage.Stage;

/**
 * Canvas app with explicit update and draw callbacks. Read or change this source when contributing to Zero.
 * settings configures the window; setup runs once after canvas creation,
 * before the window is shown.
 * Each frame calls update(seconds), then draw, on the JavaFX application thread.
 * Keep callbacks short: slow work blocks drawing and normal JavaFX controls.
 */
public abstract class SketchApp extends SimpleApp {
    private Canvas canvas;
    private BorderPane layout;
    private GraphicsContext graphics;
    private AnimationTimer timer;
    private final EnumSet<KeyCode> keys = EnumSet.noneOf(KeyCode.class);
    private final EnumSet<MouseButton> buttons = EnumSet.noneOf(MouseButton.class);
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
            if (canvas.isFocused()) keys.add(event.getCode());
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
                buttons.add(event.getButton());
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
                try {
                    update(seconds);
                    draw();
                } catch (RuntimeException | Error failure) {
                    stop(); // One useful stack trace, rather than the same error every frame.
                    throw failure;
                }
            }
        };
        timer.start();
    }

    private void clearInput() { keys.clear(); buttons.clear(); }

    @Override protected final void shutdown() {
        if (timer != null) timer.stop();
        clearInput();
    }

    public final double width() { return canvas.getWidth(); }
    public final double height() { return canvas.getHeight(); }
    public final double mouseX() { return mouseX; }
    public final double mouseY() { return mouseY; }
    public final boolean keyDown(KeyCode key) { return keys.contains(key); }
    public final boolean mouseDown(MouseButton button) { return buttons.contains(button); }

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
    public final void image(Image image, double x, double y) { graphics.drawImage(image, x, y); }
    public final void image(Image image, double x, double y, double width, double height) {
        graphics.drawImage(image, x, y, width, height);
    }
    /** Loads a bundled resource once (for example /player.png in src/main/resources). */
    public final Image loadImage(String resourcePath) {
        var resource = getClass().getResource(resourcePath);
        if (resource == null) throw new IllegalArgumentException("Image resource not found: " + resourcePath);
        Image image = new Image(resource.toExternalForm());
        if (image.isError()) throw new IllegalArgumentException("Cannot load image: " + resourcePath, image.getException());
        return image;
    }
}
