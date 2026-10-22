import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.App;

public class Main extends App {
    @Override public void settings() { padding(20); }

    public void setup() {
        var greeting = new Label("Hello, world!");
        var button = new Button("Say hello");
        button.setOnAction(event -> greeting.setText("Hello, Java!"));
        var screen = new VBox(10, greeting, button);
        show(screen);
    }
    public static void main(String[] args) { launch(args); }
}
