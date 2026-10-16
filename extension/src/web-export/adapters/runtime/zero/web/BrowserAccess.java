package zero.web;
import elemental2.dom.DomGlobal;
import elemental2.dom.Element;
import javafx.scene.canvas.Canvas;

public final class BrowserAccess {
    private BrowserAccess() { }
    public static void label(Canvas canvas, String text) {
        // setup precedes scene attachment, so apply after WebFX creates its DOM peer.
        DomGlobal.setTimeout(ignored -> {
            elemental2.dom.NodeList<Element> nodes = DomGlobal.document.querySelectorAll("canvas");
            for (int i = 0; i < nodes.length; i++) {
                Element element = nodes.item(i);
                element.setAttribute("aria-label", text);
                element.setAttribute("role", "img");
            }
        }, 0);
    }
}
