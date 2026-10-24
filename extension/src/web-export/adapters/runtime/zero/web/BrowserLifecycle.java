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
    private static final Map<Object, Runnable> removers = new HashMap<>();
    public static void own(Object owner, Runnable cleanup) {
        release(owner);
        owners.put(owner, cleanup);
        removers.put(owner, BrowserRuntime.registerStop(cleanup));
        if (!installed) {
            installed = true;
            DomGlobal.window.addEventListener("pagehide", event -> {
                // A cached page returns with the same app and animation timer.
                if (Js.isTruthy(Js.asPropertyMap(event).get("persisted"))) return;
                for (Runnable stop : new ArrayList<>(owners.values())) {
                    try { stop.run(); } catch (RuntimeException | Error failure) { BrowserRuntime.fatal("shutdown", "SHUTDOWN_FAILED", failure); }
                }
            });
        }
    }
    public static void release(Object owner) {
        owners.remove(owner);
        Runnable remove = removers.remove(owner);
        if (remove != null) remove.run();
    }
    public static void fail(String stage, String code, Throwable failure) {
        if (!BrowserRuntime.beginFailure()) return;
        for (Runnable stop : new ArrayList<>(owners.values())) {
            try { stop.run(); }
            catch (RuntimeException | Error cleanup) { if (cleanup != failure) failure.addSuppressed(cleanup); }
        }
        BrowserRuntime.fatal(stage, code, failure);
    }
}
