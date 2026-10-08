import javafx.scene.input.MouseButton;
import javafx.scene.paint.Color;
import zero.SketchApp;

/** Leave paint on the canvas instead of clearing it every frame. */
public class Main extends SketchApp {
    private double previousX;
    private double previousY;
    private boolean painting;

    @Override
    public void settings() {
        size(640, 400);
        title("Mouse painting");
    }

    @Override
    public void setup() {
        background(Color.WHITE);
    }

    @Override
    public void draw() {
        boolean inside = mouseX() >= 0 && mouseX() < width()
                && mouseY() >= 0 && mouseY() < height();
        if (mouseDown(MouseButton.SECONDARY) && inside) {
            background(Color.WHITE);
            painting = false;
        } else if (mouseDown(MouseButton.PRIMARY) && inside) {
            stroke(Color.DARKBLUE);
            strokeWidth(6);
            if (painting) line(previousX, previousY, mouseX(), mouseY());
            fill(Color.DARKBLUE);
            circle(mouseX(), mouseY(), 6); // A click also makes a dot.
            previousX = mouseX();
            previousY = mouseY();
            painting = true;
        } else {
            painting = false; // Do not connect separate strokes.
        }
    }

    public static void main(String[] args) {
        launch(args);
    }
}
