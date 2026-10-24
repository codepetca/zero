package zero.web;

import com.sun.javafx.scene.traversal.Direction;
import com.sun.javafx.scene.traversal.TraversalMethod;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyEvent;

/** Restore Tab traversal through the pinned WebFX scene's working traversal engine. */
public final class BrowserUiFocus {
    private static final Object INSTALLED = new Object();

    private BrowserUiFocus() { }

    public static void install(Scene scene) {
        if (scene.getProperties().containsKey(INSTALLED)) return;
        scene.getProperties().put(INSTALLED, true);
        scene.addEventFilter(KeyEvent.KEY_PRESSED, event -> {
            if (event.isConsumed() || event.getCode() != KeyCode.TAB
                    || event.isControlDown() || event.isAltDown() || event.isMetaDown()) return;
            Node focused = scene.getFocusOwner();
            if (focused != null && focused.traverse(
                    event.isShiftDown() ? Direction.PREVIOUS : Direction.NEXT, TraversalMethod.KEY)) {
                event.consume();
            }
        });
    }
}
