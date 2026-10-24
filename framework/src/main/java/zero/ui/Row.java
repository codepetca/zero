package zero.ui;

import java.util.ArrayList;
import java.util.Objects;
import javafx.scene.Node;
import javafx.scene.layout.HBox;

/** A horizontal collection of components, each owned by this row. */
public class Row extends Element {
    private final HBox row;

    public Row(Element... children) { this(8, children); }

    public Row(double spacing, Element... children) {
        super(createRow(spacing, children));
        row = (HBox) fxNode();
    }

    public double getSpacing() { return row.getSpacing(); }

    public void setSpacing(double spacing) {
        requireSpacing(spacing);
        row.setSpacing(spacing);
    }

    private static HBox createRow(double spacing, Element[] children) {
        requireSpacing(spacing);
        Objects.requireNonNull(children, "Row children must not be null.");
        ArrayList<Node> nodes = new ArrayList<>();
        for (Element child : children) {
            Node node = Objects.requireNonNull(child, "Row child must not be null.").fxNode();
            for (Node existing : nodes) {
                if (existing == node) throw new IllegalArgumentException("A component can appear only once in a Row.");
            }
            if (node.getParent() != null || node.getScene() != null) {
                throw new IllegalArgumentException("Row child already belongs to a layout or scene. Use a separate component.");
            }
            nodes.add(node);
        }
        HBox result = new HBox(spacing);
        result.getChildren().addAll(nodes);
        return result;
    }

    private static void requireSpacing(double spacing) {
        if (!Double.isFinite(spacing) || spacing < 0) {
            throw new IllegalArgumentException("Row spacing must be a non-negative finite number.");
        }
    }
}
