import javafx.animation.AnimationTimer;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.event.Event;
import javafx.geometry.Point2D;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.input.MouseButton;
import javafx.scene.input.MouseEvent;
import javafx.scene.input.PickResult;
import javafx.stage.Stage;

/** Drive actual canvas events and wait for the game's own animation loop; never change game fields. */
public final class PrototypeCheck extends Application {
    private final double[][] targets = {{100, 60}, {220, 180}, {360, 60}};
    private int target, wins, frames;
    private boolean moved;
    private double firstPlayerX;

    @Override public void start(Stage stage) {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(20_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_COIN_PROTOTYPE_TIMEOUT"); System.exit(1);
        }, "zero-prototype-deadline");
        watchdog.setDaemon(true); watchdog.start();
        try {
            Main app = new Main();
            app.start(stage);
            Parent root = stage.getScene().getRoot();
            require(hasText(root, "Score: 0"), "initial score");
            firstPlayerX = playerX(app);
            new AnimationTimer() {
                private long started;
                @Override public void handle(long now) {
                    try {
                        if (started == 0) started = now;
                        require(now - started < 15_000_000_000L, "two playthroughs complete within deadline");
                        frames++;
                        int points = points(app);
                        require(hasText(root, "Score: " + points), "HUD agrees with live game score");
                        require(app.layout().getCenter() == app.canvas() && app.layout().getBottom() != null,
                                "live HUD retains the canvas");
                        if (wins == 0 && playerX(app) != firstPlayerX) moved = true;
                        if (points == 3) {
                            require(hasText(root, "You win! Press Restart to play again."), "win status");
                            wins++;
                            if (wins == 2) {
                                require(frames > 10 && moved, "real game frames moved the player");
                                stop(); app.stop(); stage.close();
                                System.out.println("ZERO_COIN_PROTOTYPE_OK canvas mouse moves, live HUD, collect3/win, Restart=0, collect3/win again; frames=" + frames);
                                Platform.exit();
                                return;
                            }
                            button(root, "Restart").fire();
                            require(points(app) == 0 && hasText(root, "Score: 0"), "restart resets score");
                            require(hasText(root, "Collect all 3 coins."), "restart resets status");
                            require(playerX(app) == 40, "restart resets player");
                            target = 0;
                        } else if (points > target) target = points;
                        move(app, targets[target][0], targets[target][1]);
                    } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
                }
            }.start();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }
    private static int points(Main app) throws ReflectiveOperationException {
        var field = Main.class.getDeclaredField("points"); field.setAccessible(true); return field.getInt(app);
    }
    private static double playerX(Main app) throws ReflectiveOperationException {
        var field = Main.class.getDeclaredField("player"); field.setAccessible(true);
        return ((Player) field.get(app)).x;
    }
    private static void move(Main app, double x, double y) {
        Point2D scene = app.canvas().localToScene(x, y);
        Point2D screen = app.canvas().localToScreen(x, y);
        Event.fireEvent(app.canvas(), new MouseEvent(MouseEvent.MOUSE_MOVED, scene.getX(), scene.getY(),
                screen.getX(), screen.getY(), MouseButton.NONE, 0, false, false, false, false,
                false, false, false, false, false, false, new PickResult(app.canvas(), x, y)));
        require(Math.abs(app.mouseX() - x) < .001 && Math.abs(app.mouseY() - y) < .001,
                "canvas event reaches logical game pointer coordinates");
    }
    private static Button button(Parent parent, String text) {
        for (Node node : parent.getChildrenUnmodifiable()) {
            if (node instanceof Button button && button.getText().equals(text)) return button;
            if (node instanceof Parent child) { Button found = button(child, text); if (found != null) return found; }
        }
        return null;
    }
    private static boolean hasText(Parent parent, String text) {
        for (Node node : parent.getChildrenUnmodifiable()) {
            if (node instanceof Label label && label.getText().equals(text)) return true;
            if (node instanceof Parent child && hasText(child, text)) return true;
        }
        return false;
    }
    private static void require(boolean value, String description) {
        if (!value) throw new AssertionError(description);
    }
    public static void main(String[] args) { launch(args); }
}
