import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    private TextField answer;
    private Label feedback;

    @Override public void setup() {
        Label question = new Label("What is 2 + 3?");
        answer = new TextField();
        Button check = new Button("Check");
        feedback = new Label("");
        check.setOnAction(event -> {
            if (answer.getText().equals("5")) {
                feedback.setText("Correct!");
            } else {
                feedback.setText("Try again.");
            }
        });
        show(new VBox(10, question, answer, check, feedback));
    }

    public static void main(String[] args) { launch(args); }
}
