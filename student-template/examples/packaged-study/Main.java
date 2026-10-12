import zero.community.starterui.StartScreen;
import zero.community.starterui.Hud;

import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

/** Main owns the study rules; shared views only display values and call actions. */
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
    private boolean playing;
    private StartScreen startScreen;
    private Hud hud;
    private VBox activity;
    private Label progress;
    private Label question;
    private TextField answer;
    private Button check;
    private Button next;

    @Override public void settings() {
        title("Study with shared views");
        size(580, 400);
    }

    @Override public void setup() {
        startScreen = new StartScreen("Java study session",
                "Practise three questions. Retry an answer until it is correct, then choose Next. "
                + "Your score counts questions you eventually answer correctly.", () -> restartSession());
        hud = new Hud(() -> restartSession());
        progress = new Label();
        question = new Label();
        question.setWrapText(true);
        answer = new TextField();
        answer.setPromptText("Type your answer");
        check = new Button("Check answer");
        next = new Button("Next");
        check.setOnAction(event -> checkAnswer());
        answer.setOnAction(event -> checkAnswer());
        next.setOnAction(event -> nextQuestion());
        HBox buttons = new HBox(12, check, next);
        activity = new VBox(12, progress, question, answer, buttons, hud.view());
        activity.setPadding(new Insets(20));
        show(startScreen.view());
    }

    private void checkAnswer() {
        if (!playing || answered || finished) return;
        Question current = questions[questionIndex];
        if (current.accepts(answer.getText())) {
            answered = true;
            points++;
            hud.setScore(points);
            hud.setMessage("Correct! " + current.explanation());
            answer.setDisable(true);
            check.setDisable(true);
            next.setDisable(false);
        } else {
            hud.setMessage("Try again. You can retry without losing points.");
        }
    }

    private void nextQuestion() {
        if (!playing || !answered || finished) return;
        if (questionIndex + 1 < questions.length) {
            questionIndex++;
            showQuestion();
        } else {
            finished = true;
            playing = false;
            progress.setText("Completed " + questions.length + " of " + questions.length);
            question.setText("Study session complete!");
            answer.clear();
            answer.setDisable(true);
            check.setDisable(true);
            next.setDisable(true);
            hud.setMessage("You answered all " + questions.length + " questions correctly. "
                    + "Final score: " + points + ". Choose Restart to practise again.");
        }
    }

    private void showQuestion() {
        answered = false;
        progress.setText("Question " + (questionIndex + 1) + " of " + questions.length);
        question.setText(questions[questionIndex].prompt());
        answer.clear();
        answer.setDisable(false);
        check.setDisable(false);
        next.setDisable(true);
        hud.setMessage("Enter an answer. Get it correct to unlock Next.");
        answer.requestFocus();
    }

    private void restartSession() {
        questionIndex = 0;
        points = 0;
        finished = false;
        playing = true;
        hud.setScore(points);
        show(activity);
        showQuestion();
    }

    public static void main(String[] args) { launch(args); }
}
