import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

/** A small interface built with ordinary JavaFX controls. */
public class Main extends SimpleApp {
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
        heading.getStyleClass().add("heading");
        Label instructions = new Label("Write your name, then say hello.");
        instructions.setWrapText(true);

        name = new TextField();
        name.setPromptText("Your name");
        name.setOnAction(event -> greet()); // Enter works too.

        Button hello = new Button("Say hello");
        hello.getStyleClass().add("primary");
        hello.setOnAction(event -> greet());
        Button reset = new Button("Start again");
        reset.setOnAction(event -> restart());

        feedback = new Label("Your greeting will appear here.");
        feedback.setWrapText(true);
        HBox actions = new HBox(12, hello, reset);
        VBox screen = new VBox(16, heading, instructions, name, actions, feedback);
        screen.setPadding(new Insets(28));
        screen.getStyleClass().add("screen");

        var stylesheet = getClass().getResource("/hello-app/theme.css");
        if (stylesheet == null) {
            throw new IllegalStateException("Copy theme.css to src/main/resources/hello-app/theme.css.");
        }
        screen.getStylesheets().add(stylesheet.toExternalForm());
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
