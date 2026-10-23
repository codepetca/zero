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

/** Test-only UI playthrough: real game frames, synthetic native input, no state mutation. */
public final class PrototypeCheck extends Application {
    private final double[][] targets = {{120, 80}, {320, 260}, {520, 80},
            {120, 260}, {320, 80}, {520, 260}};
    private int frames;
    private int wins;
    private int step;
    private long waitingSince;
    private double pausedTime;
    private double pausedX;

    @Override public void start(Stage stage) {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(35_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_COIN_PROTOTYPE_TIMEOUT"); System.exit(1);
        }, "zero-prototype-deadline");
        watchdog.setDaemon(true); watchdog.start();
        try {
            Main app = new Main();
            app.start(stage);
            Parent root = stage.getScene().getRoot();
            require(hasText(root, "COIN QUEST"), "starts on title");
            require(app.canvas().getScene() == null, "title hides the canvas");
            click(root, "How to play");
            require(hasText(root, "How to play"), "instructions open while game is idle");
            click(root, "Back");
            require(hasText(root, "COIN QUEST"), "instructions return to title");
            click(root, "Play");
            freshGame(app, root);

            new AnimationTimer() {
                @Override public void handle(long now) {
                    try {
                        frames++;
                        if (step == 1) {
                            require(app.canvas().getScene() == null && app.isPaused(), "pause menu suspends gameplay");
                            require(number(app, "remaining") == pausedTime && playerX(app) == pausedX, "paused state stays frozen");
                            if (now - waitingSince < 500_000_000L) return;
                            click(root, "Resume");
                            require(app.canvas().getScene() != null && !app.isPaused(), "resume restores gameplay");
                            require(points(app) == 1, "resume retains score");
                            waitingSince = now;
                            step = 2;
                            return;
                        }
                        if (step == 2) {
                            require(number(app, "remaining") == pausedTime && playerX(app) == pausedX, "resume waits for fresh pointer movement");
                            if (now - waitingSince < 300_000_000L) return;
                            step = 3;
                        }
                        if (step == 4) {
                            // The restart deliberately retained the old pointer position.
                            // Move away for one real frame before returning to the first coin.
                            move(app, 60, 300);
                            step = 3;
                            return;
                        }
                        int points = points(app);
                        if (step == 0 && points == 1) {
                            pausedTime = number(app, "remaining");
                            pausedX = playerX(app);
                            click(root, "Pause");
                            require(hasText(root, "Paused"), "pause screen appears");
                            waitingSince = now;
                            step = 1;
                            return;
                        }
                        if (points == 6) {
                            require(hasText(root, "You win!") && hasText(root, "Final score: 6 / 6"), "victory results");
                            require(app.canvas().getScene() == null, "results replace gameplay");
                            wins++;
                            click(root, "Play again");
                            freshGame(app, root);
                            if (wins == 1) {
                                // Restart during a run, then navigate back to the title and begin again.
                                move(app, 120, 80);
                                click(root, "Restart game");
                                freshGame(app, root);
                                click(root, "Pause");
                                click(root, "Title screen");
                                require(hasText(root, "COIN QUEST"), "pause returns to title");
                                click(root, "Play");
                                freshGame(app, root);
                                step = 4;
                            } else {
                                // A direct model step covers timeout without waiting thirty wall-clock seconds.
                                move(app, 120, 80);
                                app.update(31);
                                require(hasText(root, "Time's up!") && hasText(root, "Final score: 0 / 6"), "timeout results");
                                click(root, "Title screen");
                                require(hasText(root, "COIN QUEST"), "results return to title");
                                require(frames > 10, "actual animation frames ran");
                                stop(); app.stop(); stage.close();
                                System.out.println("ZERO_COIN_PROTOTYPE_OK title/help/play, pause/freeze/resume, two levels, win/replay/restart/title, second win and direct timeout model step; frames=" + frames);
                                Platform.exit();
                                return;
                            }
                            return;
                        }
                        require(hasText(root, "Score: " + points), "HUD agrees with live game score");
                        require(app.layout().getCenter() == app.canvas() && app.layout().getBottom() != null,
                                "HUD retains the canvas");
                        move(app, targets[points][0], targets[points][1]);
                    } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
                }
            }.start();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }
    private static void freshGame(Main app, Parent root) throws ReflectiveOperationException {
        require(points(app) == 0 && number(app, "level") == 1 && number(app, "remaining") == 30, "new game resets state");
        require(playerX(app) == 48 && !app.isPaused(), "new game resets player/pause");
        require(hasText(root, "Score: 0") && hasText(root, "Time left: 30s"), "new game resets HUD");
    }
    private static int points(Main app) throws ReflectiveOperationException { return (int) number(app, "points"); }
    private static double number(Main app, String name) throws ReflectiveOperationException {
        var field = Main.class.getDeclaredField(name); field.setAccessible(true);
        return ((Number) field.get(app)).doubleValue();
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
                "native pointer event reaches logical game coordinates");
    }
    private static void click(Parent root, String text) {
        Button button = button(root, text);
        require(button != null, "visible button: " + text);
        button.fire();
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
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) { launch(args); }
}
