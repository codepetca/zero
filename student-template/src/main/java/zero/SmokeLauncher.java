package zero;

import javafx.application.Platform;
import javafx.event.Event;
import javafx.scene.control.Label;
import javafx.scene.image.WritableImage;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyEvent;
import javafx.scene.paint.Color;

/** Contributor check, selected only with -Psmoke. A real GUI window closes itself. */
public final class SmokeLauncher extends SimpleApp {
    private int phase;
    private boolean setupRan;

    @Override public void settings() { size(120, 100); title("Zero verification (closes automatically)"); }
    @Override public void setup() {
        setupRan = true;
        layout().setBottom(new Label("Checking lifecycle and pixels"));
        require(width() == 120 && height() == 100, "settings before setup");
    }
    @Override public void update(double seconds) {
        try {
            require(setupRan, "setup before update");
            require(seconds >= 0 && seconds <= 0.1, "bounded frame time");
            if (phase == 1) {
                WritableImage pixels = canvas().snapshot(null, null);
                require(pixels.getPixelReader().getColor(1, 1).equals(Color.WHITE), "background clears canvas");
                require(pixels.getPixelReader().getColor(20, 20).equals(Color.RED), "rectangle pixels");
                require(pixels.getPixelReader().getColor(70, 50).equals(Color.BLUE), "circle centre pixels");
                Event.fireEvent(canvas(), new KeyEvent(KeyEvent.KEY_PRESSED, "", "", KeyCode.SPACE, false, false, false, false));
                require(keyDown(KeyCode.SPACE), "held key press");
                Event.fireEvent(canvas(), new KeyEvent(KeyEvent.KEY_RELEASED, "", "", KeyCode.SPACE, false, false, false, false));
                require(!keyDown(KeyCode.SPACE), "held key release");
                System.out.println("ZERO_SMOKE_OK lifecycle, canvas pixels, held keys, native control");
                Platform.exit();
            }
        } catch (Throwable failure) {
            failure.printStackTrace();
            System.exit(1);
        }
    }
    @Override public void draw() {
        background(Color.WHITE);
        fill(Color.RED);
        rect(10, 10, 30, 30);
        fill(Color.BLUE);
        circle(70, 50, 20);
        phase++;
    }
    private static void require(boolean condition, String description) {
        if (!condition) throw new AssertionError(description);
    }
    public static void main(String[] args) { launch(args); }
}
