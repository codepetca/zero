package zero;

import java.awt.Desktop;
import javafx.scene.Node;
import javafx.stage.Stage;

/** Test-only native activation; call on the JavaFX thread until focus or timeout. */
public final class NativeFocus {
    private static long lastActivationRequest;

    private NativeFocus() { }

    public static boolean await(Node target, long started, String description) {
        if (target.isFocused()) return true;
        var scene = target.getScene();
        var window = scene.getWindow();
        long now = System.nanoTime();
        if (now - started >= 3_000_000_000L) {
            throw new AssertionError(description + " timed out: windowFocused=" + window.isFocused()
                    + ", focusOwner=" + scene.getFocusOwner());
        }
        // Scene focus alone is insufficient when macOS has not activated the app.
        if (!window.isFocused() && (lastActivationRequest == 0 || now - lastActivationRequest >= 250_000_000L)) {
            if (Desktop.isDesktopSupported()) {
                var desktop = Desktop.getDesktop();
                if (desktop.isSupported(Desktop.Action.APP_REQUEST_FOREGROUND)) desktop.requestForeground(true);
            }
            ((Stage) window).toFront();
            window.requestFocus();
            lastActivationRequest = now;
        }
        if (scene.getFocusOwner() != target) target.requestFocus();
        return false;
    }
}
