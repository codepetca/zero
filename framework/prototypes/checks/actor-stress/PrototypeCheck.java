import javafx.animation.AnimationTimer;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.stage.Stage;

/** Functional native acceptance; browser timing is measured separately. */
public final class PrototypeCheck extends Application {
    private final int[] counts = {100, 250, 500, 1000, 2000, 5000,
            1000, 2000, 5000, 1000, 2000, 5000, 1000, 2000, 5000};
    private final int[] sizes = {32, 32, 32, 32, 32, 32,
            64, 64, 64, 128, 128, 128, 256, 256, 256};
    private int step;
    private int frames;

    public void start(Stage stage) {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(45_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_ACTOR_STRESS_TIMEOUT"); System.exit(1);
        });
        watchdog.setDaemon(true); watchdog.start();
        try {
            Main app = new Main();
            app.start(stage);
            Parent root = stage.getScene().getRoot();
            new AnimationTimer() {
                public void handle(long now) {
                    try {
                        frames++;
                        require(label(root, "Actors: " + counts[step]) != null, "selected count is visible");
                        require(prefix(root, "Sprite: " + sizes[step] + " × " + sizes[step]) != null,
                                "selected size is visible");
                        Label fps = prefix(root, "FPS: ");
                        if (fps == null || fps.getText().contains("warming")) return;
                        require(Integer.parseInt(fps.getText().substring(5)) >= 0, "live completed-frame FPS");
                        require(prefix(root, "Average frame: ").getText().contains(" ms"), "frame time is visible");
                        var field = Main.class.getDeclaredField("actors"); field.setAccessible(true);
                        StressActor[] actors = (StressActor[]) field.get(app);
                        require(actors.length == counts[step], "actual actor array matches control");
                        int size = sizes[step];
                        require(actors[0].width() == size && actors[0].height() == size, "actual drawing dimensions");
                        require(actors[0].rotation() > 0 && actors[0].x() > size / 2.0, "actors update movement and rotation");
                        var animationField = zero.Actor.class.getDeclaredField("animation"); animationField.setAccessible(true);
                        zero.SpriteAnimation first = (zero.SpriteAnimation) animationField.get(actors[0]);
                        zero.SpriteAnimation last = (zero.SpriteAnimation) animationField.get(actors[actors.length - 1]);
                        require(first != last && first.image() == last.image(), "independent clocks share one cached image");
                        require(first.frame().width() == size && first.frame().height() == size
                                && first.image().getWidth() == size * 4 && first.image().getHeight() == size,
                                "real PNG dimensions match selected frame size");
                        step++;
                        if (step == counts.length) {
                            require(frames > 10, "real frames ran");
                            stop(); app.stop(); stage.close(); Platform.exit();
                            System.out.println("ZERO_ACTOR_STRESS_OK six counts and 64/128/256 x 1000/2000/5000 matrix; real PNG dimensions, shared images, independent clocks, movement and live FPS; frames=" + frames);
                        } else {
                            if (sizes[step] != sizes[step - 1]) {
                                Button sizeButton = button(root, sizes[step] + " px");
                                require(sizeButton != null, "size button exists"); sizeButton.fire();
                            }
                            Button button = button(root, counts[step] + " actors");
                            require(button != null, "workload button exists"); button.fire();
                            require(prefix(root, "FPS: ").getText().contains("warming"), "count switch resets metrics");
                        }
                    } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
                }
            }.start();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }

    private static Label label(Parent root, String text) {
        Label found = prefix(root, text);
        return found != null && found.getText().equals(text) ? found : null;
    }
    private static Label prefix(Parent root, String text) {
        for (Node node : root.getChildrenUnmodifiable()) {
            if (node instanceof Label label && label.getText().startsWith(text)) return label;
            if (node instanceof Parent child) { Label result = prefix(child, text); if (result != null) return result; }
        }
        return null;
    }
    private static Button button(Parent root, String text) {
        for (Node node : root.getChildrenUnmodifiable()) {
            if (node instanceof Button button && button.getText().equals(text)) return button;
            if (node instanceof Parent child) { Button result = button(child, text); if (result != null) return result; }
        }
        return null;
    }
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    public static void main(String[] args) { launch(args); }
}
