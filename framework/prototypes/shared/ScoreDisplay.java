import zero.ui.Element;
import zero.ui.Label;

/** The same ordinary student component is copied unchanged into both examples. */
public class ScoreDisplay implements ScoreView {
    private final Label label = new Label("Score: 0");

    @Override public Element view() {
        return label;
    }

    @Override public void setScore(int score) {
        label.setText("Score: " + score);
    }
}
