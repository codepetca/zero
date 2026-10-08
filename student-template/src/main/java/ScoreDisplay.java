import javafx.scene.Node;
import javafx.scene.control.Label;

/** An ordinary class: the app owns the number; this object displays it. */
public class ScoreDisplay {
    private final Label label;

    public ScoreDisplay() {
        label = new Label("Score: 0");
    }

    public void setScore(int points) {
        label.setText("Score: " + points);
    }

    public Node view() {
        return label;
    }
}
