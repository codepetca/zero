import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.paint.Color;
import zero.SimpleApp;

/** Ordinary JavaFX controls can live beside the Zero canvas. */
public class Main extends SimpleApp {
    private int count;
    private Label total;

    @Override
    public void settings() {
        size(480, 240);
        title("Click counter");
    }

    @Override
    public void setup() {
        total = new Label("Count: 0");
        Button add = new Button("Add one");
        Button reset = new Button("Reset");
        add.setOnAction(event -> {
            count++;
            total.setText("Count: " + count);
        });
        reset.setOnAction(event -> {
            count = 0;
            total.setText("Count: " + count);
        });
        HBox controls = new HBox(12, add, reset, total);
        controls.setPadding(new Insets(12));
        layout().setBottom(controls); // The normal JavaFX BorderPane escape hatch.
    }

    @Override
    public void draw() {
        background(Color.BEIGE);
        fill(Color.DARKSLATEGRAY);
        textSize(24);
        text("You clicked " + count + " times.", 24, 70);
        textSize(16);
        text("Buttons change a field; draw reads that field.", 24, 110);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
