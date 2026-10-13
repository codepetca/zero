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
        // Handle every event, including a click that finishes between frames.
        canvas().setOnMousePressed(event -> {
            painting = false; // Each press starts a separate stroke.
            if (event.isSecondaryButtonDown()) clearAt(event.getX(), event.getY());
            else if (event.getButton() == MouseButton.PRIMARY) paintAt(event.getX(), event.getY());
        });
        canvas().setOnMouseDragged(event -> {
            if (event.isSecondaryButtonDown()) clearAt(event.getX(), event.getY());
            else if (event.isPrimaryButtonDown()) paintAt(event.getX(), event.getY());
            else painting = false;
        });
        canvas().setOnMouseReleased(event -> {
            if (event.getButton() == MouseButton.PRIMARY) painting = false;
        });
        canvas().setOnMouseExited(event -> painting = false);
        canvas().focusedProperty().addListener((property, wasFocused, focused) -> {
            if (!focused) painting = false;
        });
    }

    private boolean inside(double x, double y) {
        return x >= 0 && x < width() && y >= 0 && y < height();
    }

    private void clearAt(double x, double y) {
        if (inside(x, y)) background(Color.WHITE);
        painting = false;
    }

    private void paintAt(double x, double y) {
        if (!inside(x, y)) {
            painting = false; // Re-entering the canvas starts a new segment.
            return;
        }
        stroke(Color.DARKBLUE);
        strokeWidth(6);
        if (painting) line(previousX, previousY, x, y);
        fill(Color.DARKBLUE);
        circle(x, y, 6); // A click also makes a dot.
        previousX = x;
        previousY = y;
        painting = true;
    }

    public static void main(String[] args) {
        launch(args);
    }
}
