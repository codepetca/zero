package zero.web;

import dev.webfx.kit.mapper.peers.javafxgraphics.elemental2.shared.HtmlSvgNodePeer;
import elemental2.dom.CSSStyleDeclaration;
import elemental2.dom.DomGlobal;
import elemental2.dom.EventListener;
import elemental2.dom.HTMLElement;
import elemental2.dom.PointerEvent;
import elemental2.dom.PointerEventInit;
import elemental2.dom.ViewCSS;
import javafx.beans.value.ChangeListener;
import javafx.scene.Scene;
import javafx.scene.Parent;
import javafx.scene.canvas.Canvas;
import javafx.scene.input.MouseEvent;
import javafx.scene.input.PickResult;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.Pane;
import javafx.scene.transform.Scale;
import javafx.scene.transform.Affine;
import javafx.scene.transform.Transform;
import jsinterop.base.Js;

/** Fit a browser GameApp without changing its Java canvas or ordinary App layouts. */
public final class BrowserGameViewport {
    private final BorderPane content;
    private final Canvas canvas;
    private final javafx.scene.Node gameContent;
    private final Runnable clearInput;
    private final Scene scene;
    private double fittedScale = 1;
    private double logicalWidth, logicalHeight;
    private int initialMeasureFrame = -1;
    private final ChangeListener<Number> sizeChanged = (observable, before, after) -> fit();
    private final EventListener resized = event -> fit();
    private final EventListener interrupted = event -> interruptInput();
    private final EventListener visibility = event -> { if (DomGlobal.document.hidden) interruptInput(); };
    private final EventListener pointer = event -> handlePointer((PointerEvent) event);
    private final EventListener secondaryTouch = event -> ignoreSecondaryTouch((PointerEvent) event);
    private HTMLElement element;
    private String previousTouchAction;
    private PointerEvent lastTouch;
    private int activePointer = -1;
    private boolean installed, closed, releasing;

    public BrowserGameViewport(BorderPane content, Canvas canvas, javafx.scene.Node gameContent, Runnable clearInput) {
        this.content = content;
        this.canvas = canvas;
        this.gameContent = gameContent;
        this.clearInput = clearInput;
        // setup has added padding and controls, but unattached WebFX controls can
        // still report their fallback skin size. This is an initial scene estimate;
        // install remeasures after attachment, before fixing the logical viewport.
        logicalWidth = Math.max(1, content.prefWidth(-1));
        logicalHeight = Math.max(1, content.prefHeight(logicalWidth));
        content.resize(logicalWidth, logicalHeight);
        content.getTransforms().add(new MatrixScale(1));
        // The pinned Group peer has a zero-size CSS box; the runtime stylesheet
        // clips scene roots, so Group would hide its otherwise positioned children.
        // A resizable Pane receives the full scene size. Its unmanaged content
        // keeps the natural logical size and is laid out explicitly below.
        content.setManaged(false);
        Pane root = new Pane(content);
        scene = new Scene(root, logicalWidth, logicalHeight);
        content.layout();
    }

    public Scene scene() { return scene; }

    /** The pinned MouseEvent.copyFor can copy local x/y into sceneX/sceneY.
     * Its PickResult retains the original intersection, including for generated
     * click/enter/exit events; reconstruct the scene point before converting once.
     */
    public static javafx.geometry.Point2D canvasPoint(Canvas canvas, MouseEvent event) {
        PickResult pick = event.getPickResult();
        if (pick == null || pick.getIntersectedPoint() == null)
            return canvas.sceneToLocal(event.getSceneX(), event.getSceneY());
        com.sun.javafx.geom.Point2D point = pick.getIntersectedPoint();
        javafx.scene.Node node = pick.getIntersectedNode();
        if (node == null) return canvas.sceneToLocal(point.x, point.y);
        javafx.geometry.Point2D scenePoint = node.localToScene(point.x, point.y);
        return canvas.sceneToLocal(scenePoint.getX(), scenePoint.getY());
    }


    public void install() {
        if (installed || closed) return;
        installed = true;
        measureContent();
        scene.widthProperty().addListener(sizeChanged);
        scene.heightProperty().addListener(sizeChanged);
        DomGlobal.window.addEventListener("resize", resized);
        DomGlobal.window.addEventListener("orientationchange", resized);
        DomGlobal.window.addEventListener("blur", interrupted);
        DomGlobal.window.addEventListener("pagehide", interrupted);
        DomGlobal.document.addEventListener("visibilitychange", visibility);
        // Resolve this canvas's pinned WebFX peer, rather than selecting another
        // canvas (or a native text field) elsewhere in the document.
        element = (HTMLElement) HtmlSvgNodePeer.toContainerElement(canvas);
        previousTouchAction = element.style.getPropertyValue("touch-action");
        element.style.setProperty("touch-action", "none");
        for (String type : new String[]{"pointerdown", "pointermove", "pointerup", "pointerenter", "pointerleave", "pointercancel", "lostpointercapture"}) {
            // Enter/leave also target ancestors separately. Guard before the
            // scene peer, including trailing exits after the primary finger lifts.
            DomGlobal.window.addEventListener(type, secondaryTouch, true);
            element.addEventListener(type, pointer, true);
        }
        fit();
        // Let initial DOM peer styles/layout settle once. Subsequent viewport
        // resizes only fit these natural dimensions and cannot feed back into them.
        initialMeasureFrame = DomGlobal.requestAnimationFrame(timestamp -> {
            initialMeasureFrame = -1;
            if (closed) return;
            measureContent();
            fit();
        });
    }

    private void measureContent() {
        // Titles and menus share the retained game viewport. Measure the game
        // and HUD without navigating or running lifecycle callbacks.
        javafx.scene.Node selected = content.getCenter();
        try {
            content.setCenter(gameContent);
            invalidateMeasurements(content);
            logicalWidth = Math.max(1, content.prefWidth(-1));
            logicalHeight = Math.max(1, content.prefHeight(logicalWidth));
            content.resize(logicalWidth, logicalHeight);
            content.layout();
        } finally {
            content.setCenter(selected);
        }
    }

    private static void invalidateMeasurements(Parent parent) {
        for (javafx.scene.Node child : parent.getChildrenUnmodifiable())
            if (child instanceof Parent) invalidateMeasurements((Parent) child);
        parent.requestLayout();
    }

    private void fit() {
        if (closed) return;
        CSSStyleDeclaration style = Js.<ViewCSS>uncheckedCast(DomGlobal.window)
                .getComputedStyle(DomGlobal.document.documentElement);
        double left = inset(style, "left"), right = inset(style, "right");
        double top = inset(style, "top"), bottom = inset(style, "bottom");
        double width = Math.max(0, scene.getWidth() - left - right);
        double height = Math.max(0, scene.getHeight() - top - bottom);
        if (width <= 0 || height <= 0) return;
        double factor = Math.min(1, Math.min(width / logicalWidth, height / logicalHeight));
        if (factor != fittedScale) {
            fittedScale = factor;
            content.getTransforms().set(0, new MatrixScale(factor));
        }
        // Use fixed logical dimensions, not transformed bounds: this avoids
        // feeding the previous scale/translation back into subsequent resizes.
        content.setTranslateX(left + (width - logicalWidth * factor) / 2);
        content.setTranslateY(top + (height - logicalHeight * factor) / 2);
    }

    /** Keep the pinned HTML peer's CSS origin consistent with the FX zero pivot.
     * HtmlTransforms.toHtmlScale emits scale() for pivot zero, but HtmlNodePeer
     * gives scale() a center origin. An explicit matrix gets its correct 0,0
     * origin and the same inverse mapping in canvas.sceneToLocal().
     */
    private static final class MatrixScale extends Transform {
        private final Scale scale;
        private final double factor;
        MatrixScale(double factor) {
            this.factor = factor;
            scale = new Scale(factor, factor, 0, 0);
        }
        @Override public com.sun.javafx.geom.Point2D transform(double x, double y) {
            return scale.transform(x, y);
        }
        @Override public Transform createInverse() { return new MatrixScale(1 / factor); }
        @Override protected Affine createAffine() { return scale.toAffine(); }
    }

    private static double inset(CSSStyleDeclaration style, String side) {
        String value = style.getPropertyValue("--safe-area-inset-" + side).trim();
        if (!value.endsWith("px")) return 0;
        try { return Math.max(0, Double.parseDouble(value.substring(0, value.length() - 2))); }
        catch (NumberFormatException ignored) { return 0; }
    }

    private void ignoreSecondaryTouch(PointerEvent event) {
        // GameApp exposes one mouse pointer. Ordinary primary touch on controls,
        // desktop mouse/keyboard, and the captured owned pointer still pass.
        if ("touch".equals(event.pointerType) && !event.isPrimary && event.pointerId != activePointer)
            event.stopImmediatePropagation();
    }

    private void handlePointer(PointerEvent event) {
        if (!"touch".equals(event.pointerType) || releasing) return;
        if ("pointerdown".equals(event.type)) {
            if (activePointer != -1 || !event.isPrimary) {
                event.stopImmediatePropagation();
                event.preventDefault();
                return;
            }
            activePointer = event.pointerId;
            lastTouch = event;
            element.setPointerCapture(activePointer);
            return;
        }
        if (event.pointerId != activePointer) {
            // Do not let an extra finger release or move the owned primary input.
            event.stopImmediatePropagation();
            return;
        }
        if ("pointermove".equals(event.type)) lastTouch = event;
        else if ("pointerup".equals(event.type)) {
            lastTouch = event;
            int pointerId = activePointer;
            activePointer = -1;
            lastTouch = null;
            if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
        } else if ("pointercancel".equals(event.type) || "lostpointercapture".equals(event.type)) {
            releaseTouch();
        }
    }

    private void interruptInput() {
        releaseTouch();
        clearInput.run();
    }

    private void releaseTouch() {
        if (activePointer == -1 || element == null) return;
        int pointerId = activePointer;
        PointerEvent last = lastTouch;
        activePointer = -1;
        lastTouch = null;
        PointerEventInit init = PointerEventInit.create();
        init.setBubbles(true);
        init.setPointerId(pointerId);
        init.setPointerType("touch");
        init.setIsPrimary(true);
        init.setButton(0);
        init.setButtons(0);
        init.setClientX(last.clientX);
        init.setClientY(last.clientY);
        init.setScreenX(last.screenX);
        init.setScreenY(last.screenY);
        // A real FX release also closes Scene's press-drag-release gesture. Clearing
        // GameApp's button set alone leaves that scene gesture stuck after cancel.
        releasing = true;
        try { element.dispatchEvent(new PointerEvent("pointerup", init)); }
        finally {
            releasing = false;
            if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
        }
    }

    public void close() {
        if (closed) return;
        releaseTouch();
        closed = true;
        if (initialMeasureFrame != -1) {
            DomGlobal.cancelAnimationFrame(initialMeasureFrame);
            initialMeasureFrame = -1;
        }
        if (!installed) return;
        scene.widthProperty().removeListener(sizeChanged);
        scene.heightProperty().removeListener(sizeChanged);
        DomGlobal.window.removeEventListener("resize", resized);
        DomGlobal.window.removeEventListener("orientationchange", resized);
        DomGlobal.window.removeEventListener("blur", interrupted);
        DomGlobal.window.removeEventListener("pagehide", interrupted);
        DomGlobal.document.removeEventListener("visibilitychange", visibility);
        for (String type : new String[]{"pointerdown", "pointermove", "pointerup", "pointerenter", "pointerleave", "pointercancel", "lostpointercapture"}) {
            DomGlobal.window.removeEventListener(type, secondaryTouch, true);
            element.removeEventListener(type, pointer, true);
        }
        if (previousTouchAction.isEmpty()) element.style.removeProperty("touch-action");
        else element.style.setProperty("touch-action", previousTouchAction);
    }
}
