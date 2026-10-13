import javafx.scene.control.Label;
import zero.SimpleApp;

public class Main extends SimpleApp {
    @Override public void setup() {
        Label greeting = new Label("Hello, Java!");
        show(greeting);
    }

    public static void main(String[] args) { launch(args); }
}
