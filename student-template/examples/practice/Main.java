import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

/** A second app reuses the exact same ScoreDisplay class. */
public class Main extends SimpleApp {
    private int completed;
    private ScoreDisplay score;

    @Override public void settings() {
        title("Practice tracker");
        size(420, 240);
    }

    @Override public void setup() {
        score = new ScoreDisplay();
        Button add = new Button("Completed an exercise");
        Button reset = new Button("Reset");
        add.setOnAction(event -> completeExercise());
        reset.setOnAction(event -> resetProgress());
        VBox screen = new VBox(12, score.view(), add, reset);
        screen.setPadding(new Insets(20));
        show(screen);
    }

    private void completeExercise() {
        completed++;
        score.setScore(completed);
    }

    private void resetProgress() {
        completed = 0;
        score.setScore(completed);
    }

    public static void main(String[] args) { launch(args); }
}
