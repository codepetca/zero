import javafx.scene.control.Label;
import zero.App;

public class Main extends App {
    public void setup() {
        var greeting = new Label("Hello, world!");
        show(greeting);
    }
    public static void main(String[] args) { launch(args); }
}
