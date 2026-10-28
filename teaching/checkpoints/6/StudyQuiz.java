import zero.ui.Button;
import zero.ui.Label;
import zero.ui.TextField;
import zero.ui.Column;

public class StudyQuiz {
    private final Column layout;
    private final Counter attempts = new Counter();
    private TextField answer;
    private Label feedback;
    private Label attemptsLabel;

    public StudyQuiz() {
        Label question = new Label("What is 2 + 3?");
        answer = new TextField();
        Button check = new Button("Check");
        Button reset = new Button("Reset");
        feedback = new Label("");
        attemptsLabel = new Label("Attempts: 0");
        check.onClick(() -> checkAnswer());
        reset.onClick(() -> resetQuiz());
        layout = new Column(10, question, answer, check, reset, feedback, attemptsLabel);
    }

    public Column view() {
        return layout;
    }

    private void checkAnswer() {
        attempts.increment();
        attemptsLabel.setText("Attempts: " + attempts.value());
        if (answer.getText().equals("5")) {
            feedback.setText("Correct!");
        } else {
            feedback.setText("Try again.");
        }
    }

    private void resetQuiz() {
        attempts.reset();
        attemptsLabel.setText("Attempts: " + attempts.value());
        answer.setText("");
        feedback.setText("");
    }

}
