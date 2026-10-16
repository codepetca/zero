import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
import zero.App;

/** A small interface built with ordinary JavaFX controls. */
public class Main extends App {
    private TextField name;
    private Label feedback;

    @Override
    public void settings() {
        title("Hello, Java");
        size(480, 340);
    }

    @Override
    public void setup() {
        Label heading = new Label("Hello, Java");
        heading.setFont(Font.font("System", FontWeight.BOLD, 32));
        Label instructions = new Label("Write your name, then say hello.");
        instructions.setWrapText(true);

        name = new TextField();
        name.setPromptText("Your name");
        name.setOnAction(event -> greet()); // Enter works too.

        Button hello = new Button("Say hello");
        hello.setOnAction(event -> greet());
        Button reset = new Button("Start again");
        reset.setOnAction(event -> restart());

        feedback = new Label("Your greeting will appear here.");
        feedback.setWrapText(true);
        HBox actions = new HBox(12, hello, reset);
        VBox screen = new VBox(16, heading, instructions, name, actions, feedback);
        screen.setPadding(new Insets(28));

        // Ordinary controls use the platform theme; no external stylesheet is required.
        show(screen);
    }

    private void greet() {
        String enteredName = name.getText().trim();
        if (enteredName.isEmpty()) {
            feedback.setText("Please write your name first.");
        } else {
            feedback.setText("Hello, " + enteredName + "!");
        }
    }

    private void restart() {
        name.setText("");
        feedback.setText("Your greeting will appear here.");
        name.requestFocus();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
