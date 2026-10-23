import zero.ui.Button;
import zero.ui.Label;
import zero.ui.TextField;
import zero.ui.Column;
import zero.App;

public class Main extends App {
    private TextField answer;
    private Label feedback;

    @Override public void settings() { padding(20); }

    @Override public void setup() {
        Label question = new Label("What is 2 + 3?");
        answer = new TextField();
        Button check = new Button("Check");
        feedback = new Label("");
        check.onClick(() -> {
            if (answer.getText().equals("5")) {
                feedback.setText("Correct!");
            } else {
                feedback.setText("Try again.");
            }
        });
        show(new Column(10, question, answer, check, feedback));
    }

    public static void main(String[] args) { launch(args); }
}
