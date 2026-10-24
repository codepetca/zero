import zero.ui.Button;
import zero.ui.Label;
import zero.ui.TextField;
import zero.ui.Column;
import zero.App;

public class Main extends App {
    private int attempts = 0;
    private TextField answer;
    private Label feedback;
    private Label attemptsLabel;

    @Override public void settings() { padding(20); }

    @Override public void setup() {
        Label question = new Label("What is 2 + 3?");
        answer = new TextField();
        Button check = new Button("Check");
        feedback = new Label("");
        attemptsLabel = new Label("Attempts: 0");
        check.onClick(() -> {
            attempts = attempts + 1;
            attemptsLabel.setText("Attempts: " + attempts);
            if (answer.getText().equals("5")) {
                feedback.setText("Correct!");
            } else {
                feedback.setText("Try again.");
            }
        });
        show(new Column(10, question, answer, check, feedback, attemptsLabel));
    }

    public static void main(String[] args) { launch(args); }
}
