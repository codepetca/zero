import javafx.scene.Node;
import javafx.scene.control.Label;

/** Main owns the score. This class presents it in either app. */
public class ScoreDisplay {
    private final Label label = new Label("Score: 0");

    public ScoreDisplay() {
        label.setStyle("-fx-font-weight: bold;");
    }

    public void setScore(int points) {
        label.setText("Score: " + points);
    }

    public void setColor(javafx.scene.paint.Color color) {
        label.setTextFill(color);
    }

    public Node view() {
        return label;
    }
}
