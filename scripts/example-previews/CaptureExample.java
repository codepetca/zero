import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.HashSet;
import javax.imageio.ImageIO;
import javafx.animation.PauseTransition;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.event.Event;
import javafx.scene.canvas.Canvas;
import javafx.scene.image.WritableImage;
import javafx.scene.input.MouseButton;
import javafx.scene.input.MouseEvent;
import javafx.stage.Stage;
import javafx.util.Duration;

/** Maintainer-only capture harness; copied into disposable projects, never exports. */
public class CaptureExample extends Application {
    private Application owned;
    private Stage ownedStage;
    private boolean finished;

    @Override public void start(Stage stage) {
        ownedStage = stage;
        Thread.currentThread().setUncaughtExceptionHandler((thread, error) -> finish(error));
        PauseTransition deadline = new PauseTransition(Duration.seconds(8));
        deadline.setOnFinished(event -> finish(new IllegalStateException("Capture deadline exceeded")));
        deadline.play();
        try {
            owned = (Application) Class.forName("Main").getDeclaredConstructor().newInstance();
            owned.init();
            owned.start(stage);
            PauseTransition settle = new PauseTransition(Duration.millis(750));
            settle.setOnFinished(event -> {
                try {
                    Path output = Path.of(getParameters().getRaw().get(0));
                    if (output.getFileName().toString().equals("drawing.png")) {
                        snapshot(stage.getScene(), Path.of("drawing-initial.png"));
                        Canvas canvas = ((zero.SketchApp) owned).canvas();
                        mouse(canvas, MouseEvent.MOUSE_PRESSED, 170, 240, true);
                        for (int x = 190; x <= 450; x += 20)
                            mouse(canvas, MouseEvent.MOUSE_DRAGGED, x, 200 + 40 * Math.cos((x - 170) / 65.0), true);
                        mouse(canvas, MouseEvent.MOUSE_RELEASED, 450, 200, false);
                        System.out.println("PREVIEW_INTERACTION drawing: finite primary mouse stroke; blank startup retained in disposable project");
                    }
                    snapshot(stage.getScene(), output);
                    if (getParameters().getRaw().size() > 1) {
                        Button start = button(stage.getScene().getRoot(), "Start");
                        if (start == null) throw new IllegalStateException("No native Start button");
                        start.fire();
                        PauseTransition nextFrame = new PauseTransition(Duration.millis(250));
                        nextFrame.setOnFinished(next -> {
                            try {
                                snapshot(stage.getScene(), Path.of(getParameters().getRaw().get(1)));
                                finish(null);
                            } catch (Throwable error) { finish(error); }
                        });
                        nextFrame.play();
                    } else finish(null);
                } catch (Throwable error) { finish(error); }
            });
            settle.play();
        } catch (Throwable error) { finish(error); }
    }

    private static void mouse(Canvas canvas, javafx.event.EventType<MouseEvent> type,
                              double x, double y, boolean down) {
        Event.fireEvent(canvas, new MouseEvent(canvas, canvas, type, x, y, x, y,
                MouseButton.PRIMARY, 1, false, false, false, false,
                down, false, false, false, false, false, null));
    }

    private static Button button(Node node, String text) {
        if (node instanceof Button candidate && candidate.getText().equals(text)) return candidate;
        if (node instanceof Parent parent) {
            for (Node child : parent.getChildrenUnmodifiable()) {
                Button found = button(child, text);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static void snapshot(Scene scene, Path output) throws Exception {
        if (scene == null) throw new IllegalStateException("App has no scene");
        scene.getRoot().applyCss();
        scene.getRoot().layout();
        WritableImage image = scene.snapshot(null);
        int width = (int) image.getWidth(), height = (int) image.getHeight();
        if (width < 1 || height < 1) throw new IllegalStateException("Empty scene");
        BufferedImage png = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        HashSet<Integer> colors = new HashSet<>();
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
            int argb = image.getPixelReader().getArgb(x, y);
            png.setRGB(x, y, argb);
            colors.add(argb);
        }
        if (!ImageIO.write(png, "png", output.toFile())) throw new IllegalStateException("No PNG writer");
        BufferedImage loaded = ImageIO.read(output.toFile());
        if (loaded == null || loaded.getWidth() != width || loaded.getHeight() != height)
            throw new IllegalStateException("PNG reload failed");
        System.out.printf("PREVIEW_OK %s %dx%d colors=%d%n", output.getFileName(), width, height, colors.size());
    }

    private void finish(Throwable error) {
        if (finished) return;
        finished = true;
        try { if (owned != null) owned.stop(); }
        catch (Throwable shutdown) { if (error == null) error = shutdown; }
        if (ownedStage != null) ownedStage.close();
        Platform.exit();
        if (error != null) { error.printStackTrace(); System.exit(1); }
    }

    public static void main(String[] args) { launch(args); }
}
