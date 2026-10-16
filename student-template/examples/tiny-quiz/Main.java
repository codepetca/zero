import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.App;

public class Main extends App {
    public void setup() {
        var question = new Label("What is 2 + 3?");
        var answer = new TextField();
        var check = new Button("Check");
        var feedback = new Label("");
        check.setOnAction(event -> {
            if (answer.getText().equals("5")) {
                feedback.setText("Correct!");
            } else {
                feedback.setText("Try again.");
            }
        });
        var screen = new VBox(10, question, answer, check, feedback);
        show(screen);
    }
    public static void main(String[] args) { launch(args); }
}
