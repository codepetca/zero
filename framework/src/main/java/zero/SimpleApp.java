package zero;

import java.util.Objects;
import javafx.application.Application;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.layout.BorderPane;
import javafx.stage.Stage;

/**
 * Small event-driven JavaFX app. settings configures the initial window;
 * setup builds ordinary JavaFX controls and calls show. Both run once on the
 * JavaFX application thread. Keep event handlers short so the UI can respond.
 */
public abstract class SimpleApp extends Application {
    private double appWidth = 800;
    private double appHeight = 500;
    private String appTitle = "Zero";
    private boolean configuring;
    private BorderPane root;

    public void settings() { }
    public void setup() { }

    /** Initial content size in pixels. SketchApp uses this as its fixed canvas size. */
    public final void size(double width, double height) {
        if (!configuring) throw new IllegalStateException("Call size inside settings().");
        if (!Double.isFinite(width) || !Double.isFinite(height) || width <= 0 || height <= 0) {
            throw new IllegalArgumentException("Width and height must be positive finite numbers.");
        }
        appWidth = width;
        appHeight = height;
    }

    public final void title(String title) {
        if (!configuring) throw new IllegalStateException("Call title inside settings().");
        appTitle = Objects.requireNonNull(title, "Window title must not be null.");
    }

    /** Display an ordinary JavaFX node after startup, usually inside setup(). */
    public final void show(Node content) {
        if (root == null) throw new IllegalStateException("Call show inside setup() or an event handler.");
        root.setCenter(Objects.requireNonNull(content, "Content must not be null."));
    }

    protected final double initialWidth() { return appWidth; }
    protected final double initialHeight() { return appHeight; }
    protected Node createContent() { return null; }
    protected Scene createScene(BorderPane content) { return new Scene(content, appWidth, appHeight); }
    protected void ready(Stage stage) { }
    protected void shutdown() { }

    @Override public final void start(Stage stage) {
        try {
            configuring = true;
            try { settings(); } finally { configuring = false; }
            root = new BorderPane();
            root.setCenter(createContent());
            setup();
            // A sketch's extra controls need room beside its fixed canvas.
            Scene scene = createScene(root);
            stage.setScene(scene);
            stage.setTitle(appTitle);
            stage.setResizable(true);
            stage.show();
            ready(stage);
        } catch (RuntimeException | Error failure) {
            stop();
            stage.close();
            throw failure;
        }
    }

    @Override public final void stop() { shutdown(); }
}
