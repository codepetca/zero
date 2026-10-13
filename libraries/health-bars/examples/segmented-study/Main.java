import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.SimpleApp;
import zero.healthbars.SegmentedHealthBar;

/** A different app uses the same component to show a finite study budget. */
public class Main extends SimpleApp {
    private int energy = 8;
    private final SegmentedHealthBar meter = new SegmentedHealthBar("Study energy", 8);
    private final TextField answer = new TextField();
    private final Label feedback = new Label("A correct answer costs 1 energy; a retry costs 2.");
    private final Button check = new Button("Check answer");
    private final Button reset = new Button("New study session");

    @Override public void settings() { title("Study energy"); size(460, 260); }

    @Override public void setup() {
        answer.setPromptText("What is 1 + 2?");
        check.setOnAction(event -> {
            if (energy == 0 || answer.getText().isBlank()) return;
            boolean correct = answer.getText().trim().equals("3");
            energy = Math.max(0, energy - (correct ? 1 : 2));
            feedback.setText(correct ? "Correct!" : "Try again.");
            refresh();
        });
        answer.setOnAction(event -> check.fire());
        reset.setOnAction(event -> {
            energy = 8;
            answer.clear();
            feedback.setText("A correct answer costs 1 energy; a retry costs 2.");
            refresh();
        });
        show(new VBox(12, new Label("Keep track of your study budget"), meter.view(), answer, check, feedback, reset));
        refresh();
    }

    private void refresh() {
        meter.setHealth(energy);
        check.setDisable(energy == 0);
        answer.setDisable(energy == 0);
    }
    public static void main(String[] args) { launch(args); }
}
