import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.App;

public class Main extends App {
    private int count = 0;
    private Label display;

    public void setup() {
        var countLabel = new Label("0");
        display = countLabel;
        var add = new Button("+1");
        var reset = new Button("Reset");
        add.setOnAction(event -> increment());
        reset.setOnAction(event -> reset());
        var screen = new VBox(10, display, add, reset);
        show(screen);
    }

    private void increment() {
        count = count + 1;
        display.setText("" + count);
    }

    private void reset() {
        count = 0;
        display.setText("" + count);
    }

    public static void main(String[] args) { launch(args); }
}
