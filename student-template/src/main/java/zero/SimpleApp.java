package zero;

import java.util.EnumSet;
import javafx.animation.AnimationTimer;
import javafx.application.Application;
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
 * Small JavaFX sketch base. Read or change this source when contributing to Zero.
 * settings runs once before the window is created; setup runs once afterward.
 * Each frame calls update(seconds), then draw, on the JavaFX application thread.
 * Keep callbacks short: slow work blocks drawing and normal JavaFX controls.
 */
public abstract class SimpleApp extends Application {
    private double appWidth = 800;
    private double appHeight = 500;
    private String appTitle = "Zero";
    private boolean configuring;
    private Canvas canvas;
    private BorderPane layout;
    private GraphicsContext graphics;
    private AnimationTimer timer;
    private final EnumSet<KeyCode> keys = EnumSet.noneOf(KeyCode.class);
    private final EnumSet<MouseButton> buttons = EnumSet.noneOf(MouseButton.class);
    private double mouseX;
    private double mouseY;

    public void settings() { }
    public void setup() { }
    public void update(double seconds) { }
    public void draw() { }

    /** Fixed canvas size, in pixels. Call only from settings. */
    public final void size(double width, double height) {
        if (!configuring) throw new IllegalStateException("Call size inside settings().");
        if (!Double.isFinite(width) || !Double.isFinite(height) || width <= 0 || height <= 0) {
            throw new IllegalArgumentException("Canvas width and height must be positive finite numbers.");
        }
        appWidth = width;
        appHeight = height;
    }

    public final void title(String title) {
        if (!configuring) throw new IllegalStateException("Call title inside settings().");
        appTitle = title;
    }

    @Override
    public final void start(Stage stage) {
        configuring = true;
        settings();
        configuring = false;
        canvas = new Canvas(appWidth, appHeight);
        graphics = canvas.getGraphicsContext2D();
        layout = new BorderPane(canvas);
        Scene scene = new Scene(layout);
        // Filters observe held keys even when a standard JavaFX control has focus.
        scene.addEventFilter(javafx.scene.input.KeyEvent.KEY_PRESSED, event -> keys.add(event.getCode()));
        scene.addEventFilter(javafx.scene.input.KeyEvent.KEY_RELEASED, event -> keys.remove(event.getCode()));
        // Track mouse position in canvas coordinates, including after dragging outside.
        scene.addEventFilter(javafx.scene.input.MouseEvent.ANY, event -> {
            var point = canvas.sceneToLocal(event.getSceneX(), event.getSceneY());
            mouseX = point.getX();
            mouseY = point.getY();
            if (event.getEventType() == javafx.scene.input.MouseEvent.MOUSE_PRESSED) buttons.add(event.getButton());
            if (event.getEventType() == javafx.scene.input.MouseEvent.MOUSE_RELEASED) buttons.remove(event.getButton());
        });
        stage.focusedProperty().addListener((property, oldValue, focused) -> {
            if (!focused) { keys.clear(); buttons.clear(); }
        });
        stage.setScene(scene);
        stage.setTitle(appTitle);
        stage.setResizable(false);
        stage.show();
        mouseX = appWidth / 2;
        mouseY = appHeight / 2;
        setup();
        stage.sizeToScene(); // Also fits controls added during setup.
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

    @Override public final void stop() {
        if (timer != null) timer.stop();
        keys.clear();
        buttons.clear();
    }

    public final double width() { return appWidth; }
    public final double height() { return appHeight; }
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
        graphics.clearRect(0, 0, appWidth, appHeight);
        graphics.setFill(color);
        graphics.fillRect(0, 0, appWidth, appHeight);
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
