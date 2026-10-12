package zero.healthbars;

import java.util.Objects;
import javafx.scene.Node;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;

/**
 * Presents app-owned health in up to ten visible segments. Create and update
 * on the JavaFX application thread. Segment boundaries divide the positive
 * integer maximum as evenly as possible; a segment can be partly filled.
 */
public final class SegmentedHealthBar {
    private final int maximum;
    private final String caption;
    private final Label label = new Label();
    private final HBox segments = new HBox(4);
    private final VBox view = new VBox(6, label, segments);
    private int health;

    /** Creates a full segmented bar with caption "Health".
     * @param maximum positive maximum health
     * @throws IllegalArgumentException if maximum is not positive
     */
    public SegmentedHealthBar(int maximum) { this("Health", maximum); }

    /** Creates a full bar; each segment represents a positive integer capacity.
     * @param caption non-null display caption
     * @param maximum positive maximum health
     * @throws NullPointerException if caption is null
     * @throws IllegalArgumentException if maximum is not positive
     */
    public SegmentedHealthBar(String caption, int maximum) {
        if (maximum <= 0) throw new IllegalArgumentException("Maximum health must be positive.");
        this.caption = Objects.requireNonNull(caption, "Health caption must not be null.");
        this.maximum = maximum;
        int count = Math.min(10, maximum);
        for (int i = 0; i < count; i++) {
            ProgressBar segment = new ProgressBar();
            segment.setMaxWidth(Double.MAX_VALUE);
            segment.setPrefWidth(24);
            HBox.setHgrow(segment, Priority.ALWAYS);
            segments.getChildren().add(segment);
        }
        setHealth(maximum);
    }

    /** Returns this instance's stable ordinary JavaFX view.
     * @return label and segmented progress controls in a VBox
     */
    public Node view() { return view; }

    /** Explicitly updates the amount; values are clamped to 0..maximum.
     * @param health requested displayed health
     */
    public void setHealth(int health) {
        this.health = Math.max(0, Math.min(maximum, health));
        label.setText(caption + ": " + this.health + " / " + maximum);
        int count = segments.getChildren().size();
        int lower = 0;
        for (int i = 0; i < count; i++) {
            // Long multiplication preserves boundaries even at Integer.MAX_VALUE.
            int upper = (int) ((long) (i + 1) * maximum / count);
            int filled = Math.max(0, Math.min(upper - lower, this.health - lower));
            ((ProgressBar) segments.getChildren().get(i)).setProgress((double) filled / (upper - lower));
            lower = upper;
        }
        view.setAccessibleText(label.getText());
    }

    /** Returns the last clamped displayed amount.
     * @return current health
     */
    public int getHealth() { return health; }

    /** Returns this instance's positive maximum.
     * @return maximum health
     */
    public int getMaximum() { return maximum; }
}
