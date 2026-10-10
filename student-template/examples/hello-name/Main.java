import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    public void setup() {
        var greeting = new Label("Hello, world!");
        var name = new TextField();
        name.setPromptText("Your name");
        var button = new Button("Say hello");
        button.setOnAction(event -> greeting.setText("Hello, " + name.getText() + "!"));
        var screen = new VBox(10, greeting, name, button);
        show(screen);
    }
    public static void main(String[] args) { launch(args); }
}
