import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.App;

/** Start here: fields, objects, and a method called by a button click. */
public class Main extends App {
    private int points;
    private TextField answer;
    private Label feedback;
    private Button check;
    private ScoreDisplay score;

    @Override public void settings() {
        title("Mini quiz");
        size(420, 300);
        padding(20);
    }

    @Override public void setup() {
        Label question = new Label("What is 6 × 7?");
        answer = new TextField();
        answer.setPromptText("Answer");
        check = new Button("Check answer");
        feedback = new Label("Enter an answer.");
        score = new ScoreDisplay();
        check.setOnAction(event -> checkAnswer());
        VBox screen = new VBox(12, question, answer, check, feedback, score.view());
        show(screen);
    }

    private void checkAnswer() {
        if (answer.getText().trim().equals("42")) {
            points += 10;
            score.setScore(points);
            feedback.setText("Correct!");
            check.setDisable(true); // Award this question only once.
        } else {
            feedback.setText("Try again.");
        }
    }

    public static void main(String[] args) { launch(args); }
}
