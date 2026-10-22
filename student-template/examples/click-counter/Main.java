import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import zero.App;

public class Main extends App {
    @Override public void settings() { padding(20); }

    private int count = 0;

    public void setup() {
        var display = new Label("0");
        var add = new Button("+1");
        add.setOnAction(event -> {
            count = count + 1;
            display.setText("" + count);
        });
        var screen = new VBox(10, display, add);
        show(screen);
    }
    public static void main(String[] args) { launch(args); }
}
