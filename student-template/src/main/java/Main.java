import javafx.scene.control.Label;
import zero.SimpleApp;

public class Main extends SimpleApp {
    public void setup() {
        var greeting = new Label("Hello, world!");
        show(greeting);
    }
    public static void main(String[] args) { launch(args); }
}
