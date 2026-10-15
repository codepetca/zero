package zero.web;
import elemental2.dom.DomGlobal;
import elemental2.dom.EventListener;

/** Preserve a focus-loss edge across requestAnimationFrame suspension. */
public final class BrowserFocus {
    private static boolean lost;
    private static EventListener blur, visibility;
    public static void install(Runnable clearInput) {
        uninstall();
        lost = false;
        Runnable onLost = () -> { lost = true; clearInput.run(); };
        blur = e -> onLost.run();
        visibility = e -> { if (DomGlobal.document.hidden) onLost.run(); };
        DomGlobal.window.addEventListener("blur", blur);
        DomGlobal.document.addEventListener("visibilitychange", visibility);
    }
    public static void uninstall() {
        if (blur != null) DomGlobal.window.removeEventListener("blur", blur);
        if (visibility != null) DomGlobal.document.removeEventListener("visibilitychange", visibility);
        blur = null; visibility = null;
    }
    public static boolean focused() {
        if (lost) { lost = false; return false; }
        return DomGlobal.document.hasFocus() && !DomGlobal.document.hidden;
    }
}
