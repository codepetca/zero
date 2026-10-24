package zero.web;

import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.scene.layout.StackPane;
import javafx.scene.text.Text;
import javafx.stage.Stage;
import elemental2.dom.DomGlobal;

/** Load every packaged image before ordinary Java setup; keep dimension checks intact. */
public final class BrowserLauncher extends Application {
    private Application app;
    private int remaining;
    private boolean failed, started;
    private double timeout, totalTimeout;
    private final java.util.Set<String> waiting = new java.util.LinkedHashSet<>();
    @Override public void start(Stage stage) {
        BrowserLifecycle.own(this, this::stop);
        Text status = new Text("Loading game images…");
        stage.setScene(new Scene(new StackPane(status), 480, 680));
        stage.show();
        remaining = PackagedResources.IMAGES.length;
        for (String path : PackagedResources.IMAGES) waiting.add(path);
        waitForProgress(status);
        totalTimeout = DomGlobal.setTimeout(ignored -> fail(status, "Image loading exceeded two minutes. Check your connection or reduce image sizes: " + String.join(", ", waiting)), 120000);
        if (remaining == 0) { launchGame(stage, status); return; }
        for (String path : PackagedResources.IMAGES) {
            ResourceURL url = Resources.get(BrowserLauncher.class, path);
            Image image = new Image(url.toExternalForm(), true);
            BrowserImages.put(path, image);
            final boolean[] complete = {false};
            Runnable check = () -> {
                if (complete[0] || failed || started) return;
                if (image.isError()) { fail(status, "Cannot load image: " + path); return; }
                if (image.getProgress() < 1) return;
                if (image.getWidth() <= 0 || image.getHeight() <= 0) { fail(status, "Invalid image dimensions: " + path); return; }
                complete[0] = true;
                waiting.remove(path);
                status.setText("Loading game images: " + (PackagedResources.IMAGES.length - remaining + 1) + "/" + PackagedResources.IMAGES.length);
                if (--remaining == 0) launchGame(stage, status);
                else waitForProgress(status);
            };
            image.progressProperty().addListener((observable, oldValue, newValue) -> check.run());
            image.errorProperty().addListener((observable, oldValue, newValue) -> check.run());
            check.run();
        }
    }
    private void waitForProgress(Text status) {
        DomGlobal.clearTimeout(timeout);
        timeout = DomGlobal.setTimeout(ignored -> fail(status, "Image loading stalled for 30 seconds. Check your connection and refresh: " + String.join(", ", waiting)), 30000);
    }
    private void clearTimeouts() {
        DomGlobal.clearTimeout(timeout);
        DomGlobal.clearTimeout(totalTimeout);
    }
    private void launchGame(Stage stage, Text status) {
        if (failed || started) return;
        started = true;
        clearTimeouts();
        Platform.runLater(() -> {
            try {
                status.setText("");
                app = new __APPLICATION_CLASS__();
                app.init();
                app.start(stage);
                BrowserRuntime.emit("ui-ready", "startup", "UI_READY", null);
            }
            catch (Exception | Error failure) {
                stage.setScene(new Scene(new StackPane(status), 480, 680));
                stage.show();
                fail(status, "Game startup failed: " + failure.getMessage(), failure, "startup", "STARTUP_FAILED");
                throw new RuntimeException("Game startup failed.", failure);
            }
        });
    }
    private void fail(Text status, String message) {
        fail(status, message, new IllegalStateException(message), "asset-load", "ASSET_MISSING");
    }
    private void fail(Text status, String message, Throwable failure, String stage, String code) {
        if (failed) return;
        failed = true;
        clearTimeouts();
        status.setText(message);
        BrowserLifecycle.fail(stage, code, failure);
    }
    @Override public void stop() {
        try { if (app != null) app.stop(); }
        catch (Exception failure) { throw new RuntimeException("Game shutdown failed.", failure); }
        finally { BrowserLifecycle.release(this); clearTimeouts(); BrowserFocus.uninstall(); }
    }
}
