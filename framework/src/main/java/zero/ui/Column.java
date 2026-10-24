package zero.ui;

import java.util.ArrayList;
import java.util.Objects;
import javafx.scene.Node;
import javafx.scene.layout.VBox;

/** A vertical collection of components, each owned by this column. */
public class Column extends Element {
    private final VBox column;

    public Column(Element... children) { this(8, children); }

    public Column(double spacing, Element... children) {
        super(createColumn(spacing, children));
        column = (VBox) fxNode();
    }

    public double getSpacing() { return column.getSpacing(); }

    public void setSpacing(double spacing) {
        requireSpacing(spacing);
        column.setSpacing(spacing);
    }

    private static VBox createColumn(double spacing, Element[] children) {
        requireSpacing(spacing);
        Objects.requireNonNull(children, "Column children must not be null.");
        ArrayList<Node> nodes = new ArrayList<>();
        for (Element child : children) {
            Node node = Objects.requireNonNull(child, "Column child must not be null.").fxNode();
            for (Node existing : nodes) {
                if (existing == node) throw new IllegalArgumentException("A component can appear only once in a Column.");
            }
            if (node.getParent() != null || node.getScene() != null) {
                throw new IllegalArgumentException("Column child already belongs to a layout or scene. Use a separate component.");
            }
            nodes.add(node);
        }
        VBox result = new VBox(spacing);
        result.getChildren().addAll(nodes);
        return result;
    }

    private static void requireSpacing(double spacing) {
        if (!Double.isFinite(spacing) || spacing < 0) {
            throw new IllegalArgumentException("Column spacing must be a non-negative finite number.");
        }
    }
}
