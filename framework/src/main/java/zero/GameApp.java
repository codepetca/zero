package zero;

import java.util.EnumSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
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
    private boolean gameVisible;
    private boolean paused;
    private boolean firstFrameReported;
    private long previousFrame;
    private double mouseX;
    private double mouseY;

    public void update(double seconds) { }
    public void draw() { }

    /** Draw an actor explicitly; this never updates or registers it. */
    public final void draw(Actor actor) {
        Objects.requireNonNull(actor, "Actor must not be null.").draw(this);
    }

    @Override protected final javafx.scene.Node createContent() {
        gameVisible = true;
        paused = false;
        firstFrameReported = false;
        previousFrame = 0;
        canvas = new Canvas(initialWidth(), initialHeight());
        canvas.setFocusTraversable(true);
        graphics = canvas.getGraphicsContext2D();
        layout = new BorderPane(canvas);
        canvas.addEventHandler(javafx.scene.input.KeyEvent.KEY_PRESSED, event -> {
            if (gameplayInputEnabled() && canvas.isFocused()) {
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

    @Override protected final Scene createScene(BorderPane content) {
        // A setup-time title must reserve the same initial space as the retained game and HUD.
        javafx.scene.Node selected = content.getCenter();
        try {
            content.setCenter(layout);
            Scene scene = new Scene(content);
            content.applyCss();
            double width = content.prefWidth(-1);
            double height = content.prefHeight(width);
            content.setPrefSize(width, height);
            return scene;
        } finally {
            content.setCenter(selected);
        }
    }

    @Override protected final void ready(Stage stage) {
        window = stage;
        Scene scene = stage.getScene();
        // Release an owned input even when dragging outside the canvas.
        scene.addEventFilter(javafx.scene.input.KeyEvent.KEY_RELEASED,
                event -> keys.remove(event.getCode()));
        scene.addEventFilter(javafx.scene.input.MouseEvent.ANY, event -> {
            if (!gameplayInputEnabled()) return;
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
        if (gameplayInputEnabled()) canvas.requestFocus();
        timer = new AnimationTimer() {
            @Override public void handle(long now) {
                if (!gameVisible || isStopped()) {
                    previousFrame = 0;
                    return;
                }
                double seconds = previousFrame == 0 ? 0 : Math.min(0.1, (now - previousFrame) / 1_000_000_000.0);
                previousFrame = now;
                pressedKeys.clear(); pressedKeys.addAll(pendingKeys); pendingKeys.clear();
                pressedButtons.clear(); pressedButtons.addAll(pendingButtons); pendingButtons.clear();
                beginFrame();
                String stage = "frame-update";
                try {
                    if (!paused) update(seconds);
                    stage = "frame-draw";
                    if (!isStopped()) draw();
                    endFrame(true);
                    if (!isStopped() && !firstFrameReported) {
                        firstFrameReported = true;
                        runtimeEvent("first-frame", "frame-draw", "FIRST_FRAME");
                    }
                } catch (RuntimeException | Error failure) {
                    endFrame(false);
                    runtimeFailure(stage, "FRAME_EXCEPTION", failure);
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

    private boolean gameplayInputEnabled() {
        return gameVisible && !paused && window != null && !isStopped();
    }

    @Override void contentChanged(javafx.scene.Node content) {
        gameVisible = content == layout;
        previousFrame = 0;
        clearInput();
        if (gameplayInputEnabled()) canvas.requestFocus();
    }

    @Override protected final void shutdown() {
        Throwable failure = null;
        try { if (timer != null) timer.stop(); }
        catch (RuntimeException | Error error) { failure = error; }
        gameVisible = false;
        previousFrame = 0;
        clearInput();
        imageCache.clear();
        window = null;
        if (failure instanceof RuntimeException error) throw error;
        if (failure instanceof Error error) throw error;
    }

    public final double width() { return canvas.getWidth(); }
    public final double height() { return canvas.getHeight(); }
    public final double mouseX() { return mouseX; }
    public final double mouseY() { return mouseY; }
    public final boolean keyDown(KeyCode key) { return keys.contains(key); }
    public final boolean keyDown(Key key) {
        return keyDown(Objects.requireNonNull(key, "Key must not be null.").fxKeyCode());
    }
    /** Whether the primary pointer button is held on the game canvas. */
    public final boolean mouseDown() { return mouseDown(MouseButton.PRIMARY); }

    public final boolean mouseDown(MouseButton button) { return buttons.contains(button); }

    /** True throughout the next update/draw frame after an owned press; queries do not consume it. */
    public final boolean keyPressed(KeyCode key) { return pressedKeys.contains(key); }
    public final boolean keyPressed(Key key) {
        return keyPressed(Objects.requireNonNull(key, "Key must not be null.").fxKeyCode());
    }
    /** Whether the primary pointer button was newly pressed this frame. */
    public final boolean mousePressed() { return mousePressed(MouseButton.PRIMARY); }

    public final boolean mousePressed(MouseButton button) { return pressedButtons.contains(button); }
    /** Window focus, even when a native control rather than the canvas has keyboard focus. */
    public final boolean windowFocused() { return window != null && window.isFocused(); }

    /** Standard JavaFX escape hatches: call after the canvas is created. */
    public final Canvas canvas() { return canvas; }
    public final GraphicsContext graphics() { return graphics; }
    public final BorderPane layout() { return layout; }

    /** Return to the retained canvas and controls without changing the explicit pause state. */
    public final void showGame() {
        requireContentReady("showGame");
        if (layout == null) throw new IllegalStateException("Call showGame inside setup() or an event handler.");
        show(layout);
    }

    /** Freeze updates while drawing and ordinary UI callbacks continue. */
    public final void pause() {
        requireContentReady("pause");
        paused = true;
        previousFrame = 0;
        clearInput();
    }

    /** Resume updates with no held input and a zero-second first frame. */
    public final void resume() {
        requireContentReady("resume");
        paused = false;
        previousFrame = 0;
        clearInput();
    }

    /** Read the explicit pause state; displaying another view suspends gameplay separately. */
    public final boolean isPaused() {
        requireContentReady("isPaused");
        return paused;
    }

    /** Mount live controls below the canvas, replacing previous controls without stopping gameplay. */
    public final void controls(zero.ui.Element content) {
        if (layout == null) throw new IllegalStateException("Call controls inside setup() or an event handler.");
        javafx.scene.Node node = Objects.requireNonNull(content, "Controls must not be null.").fxNode();
        if (node != layout.getBottom() && (node.getParent() != null || node.getScene() != null)) {
            throw new IllegalArgumentException("Controls already belong to a layout or scene. Use a separate component.");
        }
        layout.setBottom(node);
    }

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
    public final void background(zero.Color color) {
        background(Objects.requireNonNull(color, "Background color must not be null.").fxColor());
    }
    public final void fill(zero.Color color) {
        fill(Objects.requireNonNull(color, "Fill color must not be null.").fxColor());
    }
    public final void stroke(zero.Color color) {
        stroke(Objects.requireNonNull(color, "Stroke color must not be null.").fxColor());
    }
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
    /** Load a full-image region sharing the app's cached bundled image. */
    public final ImageRegion loadImageRegion(String resourcePath) {
        Image image = loadImage(Objects.requireNonNull(resourcePath, "Image resource path must not be null."));
        return new ImageRegion(image, 0, 0, image.getWidth(), image.getHeight());
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
