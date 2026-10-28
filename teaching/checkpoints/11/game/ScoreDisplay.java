import zero.ui.Element;
import zero.ui.Label;

/** The calling class owns scoring rules; this component retains only its displayed values. */
public class ScoreDisplay {
    private final Label label = new Label("Score: 0");
    private String caption = "Score";
    private int points;

    public void setScore(int points) {
        this.points = points;
        refresh();
    }

    public void setCaption(String caption) {
        if (caption == null) {
            throw new IllegalArgumentException("Score caption must not be null.");
        }
        this.caption = caption;
        refresh();
    }

    private void refresh() {
        label.setText(caption + ": " + points);
    }

    public Element view() {
        return label;
    }
}
