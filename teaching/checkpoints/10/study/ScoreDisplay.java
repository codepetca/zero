import zero.ui.Element;
import zero.ui.Label;

/** The calling class owns the score. This class presents it in either app. */
public class ScoreDisplay {
    private final Label label = new Label("Score: 0");

    public void setScore(int points) {
        label.setText("Score: " + points);
    }

    public Element view() {
        return label;
    }
}
