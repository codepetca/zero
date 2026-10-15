package zero;

import java.util.Objects;
import java.net.URL;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import javafx.stage.WindowEvent;
import javafx.application.Application;
import javafx.geometry.Insets;
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
    private double appPadding;
    private boolean configuring;
    private boolean shutdownCalled;
    private BorderPane root;
    private final Map<String, Sound> soundCache = new HashMap<>();
    private final ArrayList<Music> musicPlayers = new ArrayList<>();

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

    /** Initial space around all content, in pixels on each edge. Call inside settings(). */
    public final void padding(double pixels) {
        if (!configuring) throw new IllegalStateException("Call padding inside settings().");
        if (!Double.isFinite(pixels) || pixels < 0) {
            throw new IllegalArgumentException("Padding must be a non-negative finite number.");
        }
        appPadding = pixels;
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
        shutdownCalled = false;
        try {
            configuring = true;
            try { settings(); } finally { configuring = false; }
            root = new BorderPane();
            root.setPadding(new Insets(appPadding));
            root.setCenter(createContent());
            setup();
            // A sketch's extra controls need room beside its fixed canvas.
            Scene scene = createScene(root);
            stage.setScene(scene);
            stage.setTitle(appTitle);
            stage.setResizable(true);
            stage.addEventHandler(WindowEvent.WINDOW_HIDDEN, event -> stop());
            stage.show();
            ready(stage);
        } catch (RuntimeException | Error failure) {
            try { stop(); } catch (RuntimeException | Error cleanup) { failure.addSuppressed(cleanup); }
            try { stage.close(); } catch (RuntimeException | Error cleanup) { failure.addSuppressed(cleanup); }
            throw failure;
        }
    }

    @Override public final void stop() {
        Throwable failure = null;
        // Window hiding and the JavaFX launcher can both stop the same lifecycle.
        if (!shutdownCalled) {
            shutdownCalled = true; // A throwing or reentrant hook must not run again.
            try { shutdown(); } catch (RuntimeException | Error error) { failure = error; }
        }
        // Release every resource even if a custom shutdown or one native close fails.
        for (Sound sound : soundCache.values()) {
            try { sound.close(); } catch (RuntimeException | Error error) {
                if (failure == null) failure = error; else failure.addSuppressed(error);
            }
        }
        soundCache.clear();
        for (Music music : musicPlayers) {
            try { music.close(); } catch (RuntimeException | Error error) {
                if (failure == null) failure = error; else failure.addSuppressed(error);
            }
        }
        musicPlayers.clear();
        if (failure instanceof RuntimeException error) throw error;
        if (failure instanceof Error error) throw error;
    }

    /** Loads a short effect once per app. Resource aliases share the live Sound and its settings. */
    public final Sound loadSound(String resourcePath) {
        Sound.requireThread();
        URL resource = audioResource(resourcePath, "Sound");
        String key = audioResourceKey(resource);
        Sound sound = soundCache.get(key);
        if (sound == null || sound.isClosed()) {
            sound = new Sound(key, resourcePath);
            soundCache.put(key, sound);
        }
        return sound;
    }

    /** Loads independent music playback, owned and automatically closed by this app. */
    public final Music loadMusic(String resourcePath) {
        Sound.requireThread();
        URL resource = audioResource(resourcePath, "Music");
        Music music = new Music(audioResourceKey(resource), resourcePath);
        musicPlayers.removeIf(Music::isClosed);
        musicPlayers.add(music);
        return music;
    }

    private URL audioResource(String resourcePath, String kind) {
        if (resourcePath == null || resourcePath.isBlank()) {
            throw new IllegalArgumentException(kind + " resource path must not be blank.");
        }
        URL resource = getClass().getResource(resourcePath);
        if (resource == null) throw new IllegalArgumentException(kind + " resource not found: " + resourcePath);
        return resource;
    }
    private static String audioResourceKey(URL resource) {
        try {
            if (resource.getProtocol().equals("file")) return Path.of(resource.toURI()).toRealPath().toUri().toString();
            if (resource.getProtocol().equals("jar")) {
                String url = resource.toExternalForm();
                int separator = url.indexOf("!/");
                return url.substring(0, separator + 1) + new java.net.URI(url.substring(separator + 1)).normalize();
            }
            return resource.toURI().normalize().toString();
        } catch (java.io.IOException | java.net.URISyntaxException failure) {
            throw new IllegalArgumentException("Cannot resolve audio resource: " + resource, failure);
        }
    }
}
