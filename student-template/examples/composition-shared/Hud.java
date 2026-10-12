import javafx.geometry.Insets;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

/** Shared presentation: Main supplies the score, message and restart action. */
public class Hud {
    private final ScoreDisplay score;
    private final Label message;
    private final VBox view;

    public Hud(Runnable onRestart) {
        if (onRestart == null) throw new IllegalArgumentException("Restart needs an action.");
        score = new ScoreDisplay();
        message = new Label();
        message.setWrapText(true);
        Button restart = new Button("Restart");
        restart.setOnAction(event -> onRestart.run());
        HBox controls = new HBox(12, score.view(), restart);
        view = new VBox(12, controls, message);
        view.setPadding(new Insets(12));
    }

    public Node view() { return view; }

    public void setScore(int points) { score.setScore(points); }

    public void setMessage(String text) { message.setText(text); }
}
