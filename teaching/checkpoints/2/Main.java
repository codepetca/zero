import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import zero.App;

public class Main extends App {
    @Override public void settings() { padding(20); }

    @Override public void setup() {
        Label greeting = new Label("Hello, Java!");
        TextField name = new TextField();
        name.setPromptText("Your name");
        Button button = new Button("Say hello");
        button.setOnAction(event -> greeting.setText("Hello, " + name.getText() + "!"));
        show(new VBox(10, greeting, name, button));
    }

    public static void main(String[] args) { launch(args); }
}
