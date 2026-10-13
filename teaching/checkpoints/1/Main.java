import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    @Override public void setup() {
        Label greeting = new Label("Hello, Java!");
        Button button = new Button("Say hello");
        button.setOnAction(event -> greeting.setText("You did it!"));
        show(new VBox(10, greeting, button));
    }

    public static void main(String[] args) { launch(args); }
}
