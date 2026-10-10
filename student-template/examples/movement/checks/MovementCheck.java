import java.util.Set;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import javafx.stage.Stage;
import zero.SketchApp;

/** Maintainer check: deterministic frames, not a physical-keyboard test. */
public class MovementCheck extends Application {
    private static Object field(Object object, Class<?> type, String name) throws Exception {
        var field = type.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(object);
    }

    private static double coordinate(Player player, String name) throws Exception {
        return (double) field(player, Player.class, name);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    @Override @SuppressWarnings("unchecked")
    public void start(Stage stage) throws Exception {
        var watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("MOVEMENT_TIMEOUT");
            System.exit(1);
        });
        watchdog.setDaemon(true);
        watchdog.start();
        var app = new Main();
        try {
            app.start(stage);
            app.stop();
            var player = (Player) field(app, Main.class, "player");
            var keys = (Set<KeyCode>) field(app, SketchApp.class, "keys");
            require(coordinate(player, "x") == 40 && coordinate(player, "y") == 180,
                    "Initial position");
            app.update(0.1);
            require(coordinate(player, "x") == 40, "No keys keeps position");
            keys.add(KeyCode.RIGHT);
            app.update(0.05);
            require(coordinate(player, "x") == 49, "Elapsed-time movement");
            keys.add(KeyCode.LEFT);
            app.update(0.1);
            require(coordinate(player, "x") == 49, "Opposite arrows cancel");
            keys.clear();
            keys.add(KeyCode.RIGHT);
            keys.add(KeyCode.UP);
            app.update(0.1);
            require(coordinate(player, "x") == 67 && coordinate(player, "y") == 162,
                    "Diagonal direction");
            keys.clear();
            keys.add(KeyCode.DOWN);
            app.update(0.1);
            require(coordinate(player, "y") == 180, "Down increases y");
            player.update(-1, -1, 100, 640, 400);
            require(coordinate(player, "x") == 0 && coordinate(player, "y") == 0,
                    "Left/top bounds");
            player.update(1, 1, 100, 640, 400);
            require(coordinate(player, "x") == 616 && coordinate(player, "y") == 376,
                    "Whole square fits right/bottom bounds");
            app.draw();
            var pixels = app.canvas().snapshot(null, null).getPixelReader();
            require(pixels.getColor(620, 380).equals(Color.CORNFLOWERBLUE), "Player drawn");
            require(pixels.getColor(300, 200).equals(Color.ALICEBLUE), "Background drawn");
            app.stop();
            require(keys.isEmpty(), "Shutdown clears held keys");
            System.out.println("MOVEMENT_OK explicit movement bounds drawing shutdown");
        } catch (Throwable failure) {
            failure.printStackTrace();
            System.exit(1);
        } finally {
            app.stop();
            stage.close();
            Platform.exit();
        }
    }

    public static void main(String[] args) { launch(args); }
}
