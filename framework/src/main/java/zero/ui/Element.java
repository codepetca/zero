package zero.ui;

import java.util.Objects;
import javafx.scene.Node;

/** A small UI component backed by one ordinary JavaFX node. */
public abstract class Element {
    private final Node node;

    /** Advanced extension point for components built with JavaFX. */
    protected Element(Node node) {
        this.node = Objects.requireNonNull(node, "Element node must not be null.");
    }

    /** Enable interaction, or temporarily disable it without discarding the element's state. */
    public final void setEnabled(boolean enabled) { node.setDisable(!enabled); }

    /** Advanced interoperability bridge; the returned node has ordinary JavaFX ownership. */
    public final Node fxNode() { return node; }
}
