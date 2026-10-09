import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

/** A small study session: Main owns the state and updates ordinary objects. */
public class Main extends SimpleApp {
    private final Question[] questions = {
        new Question("What is the value of 7 / 2 when both numbers are ints?", "3",
                "Integer division drops the fractional part."),
        new Question("What boolean value does 5 > 2 produce?", "true",
                "A comparison produces true or false."),
        new Question("What index selects the first element of a Java array?", "0",
                "Java array indexes start at zero.")
    };
    private int questionIndex;
    private int points;
    private boolean answered;
    private boolean finished;
    private Label progress;
    private Label question;
    private TextField answer;
    private Label feedback;
    private Button check;
    private Button next;
    private Button restart;
    private ScoreDisplay score;

    @Override public void settings() {
        title("Java study session");
        size(580, 340);
    }

    @Override public void setup() {
        progress = new Label();
        question = new Label();
        question.setWrapText(true);
        answer = new TextField();
        answer.setPromptText("Type your answer");
        feedback = new Label();
        feedback.setWrapText(true);
        check = new Button("Check answer");
        next = new Button("Next");
        restart = new Button("Restart");
        score = new ScoreDisplay();
        check.setOnAction(event -> checkAnswer());
        answer.setOnAction(event -> checkAnswer()); // Enter also checks the answer.
        next.setOnAction(event -> nextQuestion());
        restart.setOnAction(event -> restartSession());
        HBox buttons = new HBox(12, check, next, restart);
        VBox screen = new VBox(12, progress, question, answer, buttons, feedback, score.view());
        screen.setPadding(new Insets(20));
        show(screen);
        restartSession();
    }

    private void checkAnswer() {
        if (answered || finished) return;
        Question current = questions[questionIndex];
        if (current.accepts(answer.getText())) {
            answered = true;
            points++;
            score.setScore(points);
            feedback.setText("Correct! " + current.explanation());
            answer.setDisable(true);
            check.setDisable(true);
            next.setDisable(false);
        } else {
            feedback.setText("Try again. You can retry without losing points.");
        }
    }

    private void nextQuestion() {
        if (!answered || finished) return;
        if (questionIndex + 1 < questions.length) {
            questionIndex++;
            showQuestion();
        } else {
            finished = true;
            progress.setText("Completed " + questions.length + " of " + questions.length);
            question.setText("Study session complete!");
            answer.clear();
            answer.setDisable(true);
            check.setDisable(true);
            next.setDisable(true);
            feedback.setText("You answered all " + questions.length + " questions correctly. "
                    + "Final score: " + points + ". Choose Restart to practise again.");
        }
    }

    private void showQuestion() {
        answered = false;
        progress.setText("Question " + (questionIndex + 1) + " of " + questions.length);
        question.setText(questions[questionIndex].prompt());
        answer.clear();
        answer.setDisable(false);
        feedback.setText("Enter an answer. Get it correct to unlock Next.");
        check.setDisable(false);
        next.setDisable(true);
        restart.setDisable(false);
        answer.requestFocus();
    }

    private void restartSession() {
        questionIndex = 0;
        points = 0;
        finished = false;
        score.setScore(points);
        showQuestion();
    }

    public static void main(String[] args) { launch(args); }
}
