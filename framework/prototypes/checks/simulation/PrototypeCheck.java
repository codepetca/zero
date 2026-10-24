import java.lang.reflect.Field;
import javafx.animation.AnimationTimer;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.image.WritableImage;
import javafx.scene.paint.Color;
import javafx.stage.Stage;

/** Maintainer-only finite checks; the student's app still owns its sole game loop. */
public final class PrototypeCheck extends Application {
    private int step;
    private long since;
    private double previousX;

    @Override public void start(Stage stage) {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_SIMULATION_PROTOTYPE_TIMEOUT"); System.exit(1);
        }, "zero-simulation-deadline");
        watchdog.setDaemon(true); watchdog.start();
        try {
            Main app = new Main(); app.start(stage); app.pause();
            Parent root = stage.getScene().getRoot();
            TextField input = input(root);
            require(input != null, "live speed input mounted");
            input.setText(" 250 "); click(root, "Apply");
            require(number(app, "speed") == 250 && app.isPaused(), "trimmed speed changes while paused");
            for (String invalid : new String[] {"", "fast", "2147483648", "-1", "401", "1.5"}) {
                input.setText(invalid); click(root, "Apply");
                require(number(app, "speed") == 250, "invalid speed preserves last good value: " + invalid);
                require(hasText(root, "Enter a whole number from 0 to 400."), "visible useful error");
            }
            input.setText("0"); click(root, "Apply");
            double x = number(app, "x"); app.update(.1);
            require(number(app, "x") == x && !hasText(root, "Enter a whole number from 0 to 400."), "zero speed and cleared error");
            input.setText("400"); click(root, "Apply"); app.update(.1);
            require(number(app, "x") == x + 40, "maximum speed is pixels per second");
            set(app, "x", app.width() - 13); set(app, "direction", 1); app.update(.1);
            require(number(app, "x") == app.width() - 12 && number(app, "direction") == -1, "right edge clamps and bounces");
            set(app, "x", 13.0); set(app, "direction", -1); app.update(.1);
            require(number(app, "x") == 12 && number(app, "direction") == 1, "left edge clamps and bounces");
            Stage otherStage = new Stage(); Main other = new Main(); other.start(otherStage); other.pause();
            require(number(other, "speed") == 120 && number(other, "x") == 60, "independent simulation instance");
            require(number(app, "speed") == 400, "second instance does not reset first");
            other.stop(); otherStage.close(); stage.requestFocus();
            input.setText("bad"); click(root, "Apply"); click(root, "Reset");
            fresh(app, root, input);
            since = System.nanoTime(); previousX = number(app, "x");
            new AnimationTimer() {
                @Override public void handle(long now) {
                    try {
                        if (now - since < 200_000_000L) return;
                        if (step == 0) {
                            require(number(app, "x") > previousX, "real game frames move the circle");
                            click(root, "Pause"); require(app.isPaused(), "Pause callback freezes updates");
                            previousX = number(app, "x"); step = 1; since = now;
                        } else if (step == 1) {
                            require(number(app, "x") == previousX, "paused real frames preserve position");
                            app.draw(); WritableImage pixels = app.canvas().snapshot(null, null);
                            require(pixels.getPixelReader().getColor((int) previousX, (int) app.height() / 2).equals(Color.BLUE), "blue circle draws at its model position");
                            input.setText("200"); click(root, "Apply");
                            require(app.isPaused() && number(app, "speed") == 200, "live Apply retains pause");
                            click(root, "Resume"); require(!app.isPaused(), "Resume callback restarts updates");
                            step = 2; since = now;
                        } else {
                            require(number(app, "x") > previousX, "real frames move after Resume");
                            click(root, "Pause"); input.setText("bad"); click(root, "Apply"); click(root, "Reset");
                            fresh(app, root, input);
                            stop(); app.stop(); stage.close();
                            System.out.println("ZERO_SIMULATION_PROTOTYPE_OK live frames, input validation, bounds, pause/resume/reset and independent instances");
                            Platform.exit();
                        }
                    } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
                }
            }.start();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }
    private static void fresh(Main app, Parent root, TextField input) throws Exception {
        require(number(app, "x") == 60 && number(app, "direction") == 1 && number(app, "speed") == 120, "Reset restores all motion state");
        require(input.getText().equals("120") && !app.isPaused() && button(root, "Pause") != null, "Reset restores input and running button");
        require(hasText(root, "Speed: 120") && !hasText(root, "Enter a whole number from 0 to 400."), "Reset restores labels and clears error");
    }
    private static double number(Main app, String name) throws Exception {
        Field field = Main.class.getDeclaredField(name); field.setAccessible(true); return ((Number) field.get(app)).doubleValue();
    }
    private static void set(Main app, String name, Object value) throws Exception {
        Field field = Main.class.getDeclaredField(name); field.setAccessible(true); field.set(app, value);
    }
    private static void click(Parent root, String text) {
        Button found = button(root, text); require(found != null, "button exists: " + text); found.fire();
    }
    private static Button button(Parent root, String text) {
        for (Node node : root.getChildrenUnmodifiable()) {
            if (node instanceof Button button && button.getText().equals(text)) return button;
            if (node instanceof Parent parent) { Button found = button(parent, text); if (found != null) return found; }
        } return null;
    }
    private static TextField input(Parent root) {
        for (Node node : root.getChildrenUnmodifiable()) {
            if (node instanceof TextField field) return field;
            if (node instanceof Parent parent) { TextField found = input(parent); if (found != null) return found; }
        } return null;
    }
    private static boolean hasText(Parent root, String text) {
        for (Node node : root.getChildrenUnmodifiable()) {
            if (node instanceof Label label && label.getText().equals(text)) return true;
            if (node instanceof Parent parent && hasText(parent, text)) return true;
        } return false;
    }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) { launch(args); }
}
