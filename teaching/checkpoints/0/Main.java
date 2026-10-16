import javafx.scene.control.Label;
import zero.App;

public class Main extends App {
    @Override public void setup() {
        Label greeting = new Label("Hello, Java!");
        show(greeting);
    }

    public static void main(String[] args) { launch(args); }
}
