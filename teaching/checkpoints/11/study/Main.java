import zero.ui.Button;
import zero.ui.Label;
import zero.ui.TextField;
import zero.ui.Column;
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
    private ScoreDisplay score;
    private TextField answer;
    private Button check;
    private Button next;
    private Button restart;

    @Override public void settings() { padding(20); }

    @Override public void setup() {
        questionLabel = new Label("");
        answer = new TextField();
        check = new Button("Check");
        next = new Button("Next");
        restart = new Button("Restart");
        feedback = new Label("");
        attemptsLabel = new Label("");
        score = new ScoreDisplay();
        score.setCaption("Score");
        check.onClick(() -> checkAnswer());
        next.onClick(() -> nextQuestion());
        restart.onClick(() -> restartSession());
        show(new Column(10, questionLabel, answer, check, next, restart,
                feedback, attemptsLabel, score.view()));
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
            check.setEnabled(false);
            next.setEnabled(true);
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
            answer.setEnabled(false);
            check.setEnabled(false);
            next.setEnabled(false);
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
        answer.setText("");
        answer.setEnabled(true);
        check.setEnabled(true);
        next.setEnabled(false);
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
        score.setScore(points);
    }

    public static void main(String[] args) { launch(args); }
}
