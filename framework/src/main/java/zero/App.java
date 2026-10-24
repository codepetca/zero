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
public abstract class App extends Application {
    private double appWidth = 800;
    private double appHeight = 500;
    private String appTitle = "Zero";
    private double appPadding;
    private boolean configuring;
    private boolean shutdownCalled;
    private boolean frameActive;
    private boolean runtimeFailing;
    private RuntimeReporter runtimeReporter;
    private Node pendingContent;
    private BorderPane root;
    private final Map<String, Sound> soundCache = new HashMap<>();
    private final ArrayList<Music> musicPlayers = new ArrayList<>();

    public void settings() { }
    public void setup() { }

    /** Initial content size in pixels. GameApp uses this as its fixed canvas size. */
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

    /** Space on every edge, in pixels. Call in settings, setup or an event handler. */
    public final void padding(double pixels) {
        if (!Double.isFinite(pixels) || pixels < 0) {
            throw new IllegalArgumentException("Padding must be a non-negative finite number.");
        }
        appPadding = pixels;
        if (root != null) root.setPadding(new Insets(pixels));
    }

    /** Display an ordinary JavaFX node after startup, usually inside setup(). */
    public final void show(Node content) {
        requireContentReady("show");
        Objects.requireNonNull(content, "Content must not be null.");
        if (frameActive) pendingContent = content;
        else commitContent(content);
    }

    /** Display a Zero UI component with the same replacement behavior as show(Node). */
    public final void show(zero.ui.Element content) {
        show(Objects.requireNonNull(content, "Content must not be null.").fxNode());
    }

    // One navigation path for UI apps and game frames, without a public screen lifecycle.
    final void requireContentReady(String operation) {
        if (root == null || shutdownCalled) {
            throw new IllegalStateException("Call " + operation + " inside setup() or an event handler before the app stops.");
        }
    }

    final boolean isStopped() { return shutdownCalled; }
    final void beginFrame() { frameActive = true; }
    final void endFrame(boolean successful) {
        frameActive = false;
        Node content = pendingContent;
        pendingContent = null;
        if (successful && !shutdownCalled && content != null) commitContent(content);
    }
    void contentChanged(Node content) { }

    private void commitContent(Node content) {
        root.setCenter(content);
        // Synchronous center listeners can navigate again; reconcile the view that remains.
        contentChanged(root.getCenter());
    }

    protected final double initialWidth() { return appWidth; }
    protected final double initialHeight() { return appHeight; }
    protected Node createContent() { return null; }
    protected Scene createScene(BorderPane content) { return new Scene(content, appWidth, appHeight); }
    protected void ready(Stage stage) { }
    protected void shutdown() { }

    @Override public final void start(Stage stage) {
        shutdownCalled = false;
        runtimeFailing = false;
        runtimeOpen();
        runtimeEvent("startup", "startup", "STARTING");
        frameActive = false;
        pendingContent = null;
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
            if (!shutdownCalled) runtimeEvent("ui-ready", "startup", "UI_READY");
        } catch (RuntimeException | Error failure) {
            runtimeFailing = true;
            try { stop(); } catch (RuntimeException | Error cleanup) { failure.addSuppressed(cleanup); }
            try { stage.close(); } catch (RuntimeException | Error cleanup) { failure.addSuppressed(cleanup); }
            runtimeEvent("fatal", "startup", "STARTUP_FAILED", failure);
            throw failure;
        }
    }

    @Override public final void stop() {
        pendingContent = null;
        boolean wasStopped = shutdownCalled;
        Throwable failure = null;
        try { if (root != null) root.setDisable(true); }
        catch (RuntimeException | Error error) { failure = error; }
        // Window hiding and the JavaFX launcher can both stop the same lifecycle.
        if (!shutdownCalled) {
            shutdownCalled = true; // A throwing or reentrant hook must not run again.
            try { shutdown(); } catch (RuntimeException | Error error) {
                if (failure == null) failure = error; else if (failure != error) failure.addSuppressed(error);
            }
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
        runtimeClose();
        if (!runtimeFailing) {
            if (failure != null) runtimeEvent("fatal", "shutdown", "SHUTDOWN_FAILED", failure);
            else if (!wasStopped) runtimeEvent("stopped", "shutdown", "STOPPED");
        }
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
    // Runtime reporting is internal and never grants project or editor authority.
    final void runtimeEvent(String type, String stage, String code) {
        runtimeEvent(type, stage, code, null);
    }
    final void runtimeFailure(String stage, String code, Throwable failure) {
        if (runtimeFailing || shutdownCalled) return;
        runtimeFailing = true;
        try { if (root != null) root.setDisable(true); }
        catch (RuntimeException | Error cleanup) { if (cleanup != failure) failure.addSuppressed(cleanup); }
        try { stop(); }
        catch (RuntimeException | Error cleanup) { if (cleanup != failure) failure.addSuppressed(cleanup); }
        runtimeEvent("fatal", stage, code, failure);
    }
    // BEGIN NATIVE RUNTIME REPORTER — replaced in the fingerprint-checked browser copy.
    private void runtimeOpen() {
        runtimeReporter = new RuntimeReporter();
        runtimeReporter.install(this);
    }
    private void runtimeClose() { if (runtimeReporter != null) runtimeReporter.restore(); }
    private void runtimeEvent(String type, String stage, String code, Throwable failure) {
        if (runtimeReporter != null) runtimeReporter.emit(type, stage, code, failure);
    }
    private static final class RuntimeReporter {
        private final String runId = identity("zero.runtime.runId", "ZERO_RUNTIME_RUN_ID");
        private final String buildId = identity("zero.runtime.buildId", "ZERO_RUNTIME_BUILD_ID");
        private long sequence;
        private boolean terminal;
        private Thread thread;
        private Thread.UncaughtExceptionHandler previous, installed;
        private static String identity(String property, String environment) {
            try {
                String value = System.getProperty(property);
                if (value == null) value = System.getenv(environment);
                return value != null && value.matches("[A-Za-z0-9._:-]{1,128}") ? value : null;
            } catch (SecurityException unavailable) { return null; }
        }
        private void install(App app) {
            thread = Thread.currentThread();
            previous = thread.getUncaughtExceptionHandler();
            installed = (owner, failure) -> {
                app.runtimeFailure("ui-callback", "UI_CALLBACK_FAILED", failure);
                if (previous != null) previous.uncaughtException(owner, failure);
            };
            thread.setUncaughtExceptionHandler(installed);
        }
        private void restore() {
            if (thread != null && thread.getUncaughtExceptionHandler() == installed) {
                thread.setUncaughtExceptionHandler(previous);
            }
        }
        private void emit(String type, String stage, String code, Throwable failure) {
            if (terminal || runId == null || buildId == null) return;
            if (type.equals("fatal") || type.equals("stopped")) terminal = true;
            String record = "{\"version\":1,\"runId\":" + quote(runId) + ",\"buildId\":" + quote(buildId)
                    + ",\"seq\":" + (++sequence) + ",\"type\":" + quote(type)
                    + ",\"stage\":" + quote(stage) + ",\"code\":" + quote(code)
                    + (failure == null ? "" : ",\"diagnostic\":" + quote(diagnostic(failure))) + "}";
            System.out.println("\u001eZERO_RUNTIME_V1 " + record);
        }
        private static String diagnostic(Throwable failure) {
            StringBuilder text = new StringBuilder();
            appendFailure(text, failure, "", 0);
            return text.substring(0, Math.min(8192, text.length()));
        }
        private static void appendFailure(StringBuilder text, Throwable failure, String label, int depth) {
            if (failure == null || depth >= 8 || text.length() >= 8192) return;
            text.append(label).append(failure.getClass().getName()).append(": ");
            String message = failure.getMessage();
            if (message != null) text.append(message, 0, Math.min(message.length(), 2048));
            text.append('\n');
            StackTraceElement[] stack = failure.getStackTrace();
            for (int i = 0; i < Math.min(stack.length, 24) && text.length() < 8192; i++) text.append("  at ").append(stack[i]).append('\n');
            for (Throwable suppressed : failure.getSuppressed()) {
                if (text.length() >= 8192) break;
                appendFailure(text, suppressed, "Suppressed: ", depth + 1);
            }
            appendFailure(text, failure.getCause(), "Caused by: ", depth + 1);
        }
        private static String quote(String value) {
            StringBuilder text = new StringBuilder("\"");
            for (int i = 0; i < value.length(); i++) {
                char c = value.charAt(i);
                if (c == '"' || c == '\\') text.append('\\').append(c);
                else if (c < 32 || c == 0x2028 || c == 0x2029) {
                    String hex = Integer.toHexString(c);
                    text.append("\\u");
                    for (int n = hex.length(); n < 4; n++) text.append('0');
                    text.append(hex);
                } else text.append(c);
            }
            return text.append('"').toString();
        }
    }
    // END NATIVE RUNTIME REPORTER
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
