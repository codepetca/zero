import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.App;

public class Main extends App {
    private final Counter attempts = new Counter();
    private final Question[] questions = {
            new Question("What is 2 + 3?", "5", "2 + 3 equals 5."),
            new Question("What is 9 % 4?", "1", "The remainder is 1."),
            new Question("Is 2 < 3? (true or false)", "true", "2 is less than 3.")
    };
    private int questionIndex = 0;
    private int points = 0;
    private boolean answered = false;
    private boolean finished = false;
    private Label questionLabel;
    private Label feedback;
    private Label attemptsLabel;
    private Label scoreLabel;
    private TextField answer;
    private Button check;
    private Button next;
    private Button restart;

    @Override public void settings() { padding(20); }

    @Override public void setup() {
        questionLabel = new Label();
        answer = new TextField();
        check = new Button("Check");
        next = new Button("Next");
        restart = new Button("Restart");
        feedback = new Label("");
        attemptsLabel = new Label();
        scoreLabel = new Label();
        check.setOnAction(event -> checkAnswer());
        next.setOnAction(event -> nextQuestion());
        restart.setOnAction(event -> restartSession());
        show(new VBox(10, questionLabel, answer, check, next, restart,
                feedback, attemptsLabel, scoreLabel));
        showQuestion();
        refreshStats();
    }

    private void checkAnswer() {
        if (answered || finished) return;
        attempts.increment();
        if (questions[questionIndex].accepts(answer.getText())) {
            answered = true;
            points = points + 1;
            feedback.setText("Correct! " + questions[questionIndex].explanation());
            check.setDisable(true);
            next.setDisable(false);
        } else {
            feedback.setText("Try again.");
        }
        refreshStats();
    }

    private void nextQuestion() {
        if (!answered || finished) return;
        if (questionIndex == questions.length - 1) {
            finished = true;
            questionLabel.setText("Finished! Score: " + points + " / " + questions.length);
            answer.setDisable(true);
            check.setDisable(true);
            next.setDisable(true);
            feedback.setText("Choose Restart to try again.");
            return;
        }
        questionIndex = questionIndex + 1;
        answered = false;
        showQuestion();
    }

    private void showQuestion() {
        questionLabel.setText("Question " + (questionIndex + 1) + " of "
                + questions.length + ": " + questions[questionIndex].prompt());
        answer.clear();
        answer.setDisable(false);
        check.setDisable(false);
        next.setDisable(true);
        feedback.setText("");
    }

    private void restartSession() {
        questionIndex = 0;
        points = 0;
        answered = false;
        finished = false;
        attempts.reset();
        showQuestion();
        refreshStats();
    }

    private void refreshStats() {
        attemptsLabel.setText("Attempts: " + attempts.value());
        scoreLabel.setText("Score: " + points);
    }

    public static void main(String[] args) { launch(args); }
}
