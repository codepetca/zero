package zero.healthbars;

import java.util.Objects;
import javafx.scene.Node;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.VBox;

/**
 * Presents app-owned health using ordinary JavaFX controls. Create and update
 * this object on the JavaFX application thread. Each instance has its own view;
 * a JavaFX node can be displayed in only one parent at a time.
 */
public final class HealthBar {
    private final int maximum;
    private final String caption;
    private final Label label = new Label();
    private final ProgressBar progress = new ProgressBar();
    private final VBox view = new VBox(6, label, progress);
    private int health;

    /** Creates a full bar with the caption "Health".
     * @param maximum positive maximum health
     * @throws IllegalArgumentException if maximum is not positive
     */
    public HealthBar(int maximum) { this("Health", maximum); }

    /** Creates a full bar with an app-selected caption.
     * @param caption non-null display caption
     * @param maximum positive maximum health
     * @throws NullPointerException if caption is null
     * @throws IllegalArgumentException if maximum is not positive
     */
    public HealthBar(String caption, int maximum) {
        if (maximum <= 0) throw new IllegalArgumentException("Maximum health must be positive.");
        this.caption = Objects.requireNonNull(caption, "Health caption must not be null.");
        this.maximum = maximum;
        progress.setMaxWidth(Double.MAX_VALUE);
        setHealth(maximum);
    }

    /** Returns this instance's stable ordinary JavaFX view.
     * @return label and progress controls in a VBox
     */
    public Node view() { return view; }

    /** Explicitly updates the displayed amount; values are clamped to 0..maximum.
     * @param health requested displayed health
     */
    public void setHealth(int health) {
        this.health = Math.max(0, Math.min(maximum, health));
        label.setText(caption + ": " + this.health + " / " + maximum);
        progress.setProgress((double) this.health / maximum);
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
