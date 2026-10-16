package zero.web;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.Map;
import elemental2.dom.DomGlobal;
import jsinterop.base.Js;

/** App-owned resources close even when a browser leaves without a JavaFX hide event. */
public final class BrowserLifecycle {
    private static final Map<Object, Runnable> owners = new HashMap<>();
    private static boolean installed;
    public static void own(Object owner, Runnable cleanup) {
        owners.put(owner, cleanup);
        if (!installed) {
            installed = true;
            DomGlobal.window.addEventListener("pagehide", event -> {
                // A cached page returns with the same app and animation timer.
                if (Js.isTruthy(Js.asPropertyMap(event).get("persisted"))) return;
                for (Runnable stop : new ArrayList<>(owners.values())) {
                    try { stop.run(); } catch (RuntimeException | Error failure) { DomGlobal.console.error("Audio cleanup failed: " + failure.getMessage()); }
                }
            });
        }
    }
    public static void release(Object owner) { owners.remove(owner); }
}
