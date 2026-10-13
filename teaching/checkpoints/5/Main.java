import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    private int attempts = 0;
    private TextField answer;
    private Label feedback;
    private Label attemptsLabel;

    @Override public void setup() {
        Label question = new Label("What is 2 + 3?");
        answer = new TextField();
        Button check = new Button("Check");
        Button reset = new Button("Reset");
        feedback = new Label("");
        attemptsLabel = new Label("Attempts: 0");
        check.setOnAction(event -> checkAnswer());
        reset.setOnAction(event -> resetQuiz());
        show(new VBox(10, question, answer, check, reset, feedback, attemptsLabel));
    }

    private void checkAnswer() {
        attempts = attempts + 1;
        attemptsLabel.setText("Attempts: " + attempts);
        if (answer.getText().equals("5")) {
            feedback.setText("Correct!");
        } else {
            feedback.setText("Try again.");
        }
    }

    private void resetQuiz() {
        attempts = 0;
        attemptsLabel.setText("Attempts: 0");
        answer.clear();
        feedback.setText("");
    }

    public static void main(String[] args) { launch(args); }
}
