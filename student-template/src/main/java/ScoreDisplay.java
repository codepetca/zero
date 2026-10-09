import javafx.scene.Node;
import javafx.scene.control.Label;

/** An ordinary class: the app owns the number; this object displays it. */
public class ScoreDisplay {
    private final Label label;
    private final String caption;

    public ScoreDisplay() {
        this("Score");
    }

    public ScoreDisplay(String caption) {
        this.caption = caption;
        label = new Label(caption + ": 0");
    }

    public void setScore(int points) {
        label.setText(caption + ": " + points);
    }

    public Node view() {
        return label;
    }
}
