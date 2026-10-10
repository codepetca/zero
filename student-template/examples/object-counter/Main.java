import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.SimpleApp;

public class Main extends SimpleApp {
    private final Counter counter = new Counter();

    public void setup() {
        var display = new Label("" + counter.value());
        var add = new Button("+1");
        var reset = new Button("Reset");
        add.setOnAction(event -> {
            counter.increment();
            display.setText("" + counter.value());
        });
        reset.setOnAction(event -> {
            counter.reset();
            display.setText("" + counter.value());
        });
        var screen = new VBox(10, display, add, reset);
        show(screen);
    }
    public static void main(String[] args) { launch(args); }
}
