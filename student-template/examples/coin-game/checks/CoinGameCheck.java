import java.util.Set;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.input.KeyCode;
import javafx.scene.layout.HBox;
import javafx.scene.paint.Color;
import javafx.stage.Stage;
import zero.GameApp;

/** Maintainer check: real update rules with deterministic held input and time. */
public class CoinGameCheck extends Application {
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

    private static void walk(Main app, Set<KeyCode> keys, KeyCode direction, int frames) {
        keys.clear();
        keys.add(direction);
        for (int frame = 0; frame < frames; frame++) app.update(0.1);
        keys.clear();
    }

    private static void requireReset(Main app) throws Exception {
        var player = (Player) field(app, Main.class, "player");
        var coins = (Coin[]) field(app, Main.class, "coins");
        require(coordinate(player, "x") == 40 && coordinate(player, "y") == 180,
                "Restart restores player position");
        require((int) field(app, Main.class, "points") == 0
                && !(boolean) field(app, Main.class, "won"), "Restart resets score/win");
        require(((Label) field(app, Main.class, "score")).getText().equals("Score: 0 / 3")
                && ((Label) field(app, Main.class, "message")).getText()
                        .equals("Collect every gold square."), "Restart restores labels");
        require(coins.length == 3, "Three coins");
        for (Coin coin : coins) {
            require(!coin.isCollected(), "Restart restores all coins");
            double x = (double) field(coin, Coin.class, "x");
            double y = (double) field(coin, Coin.class, "y");
            require(x >= 0 && x + 24 <= app.width() && y >= 0 && y + 24 <= app.height(),
                    "Every coin fits in the canvas");
        }
    }

    @Override @SuppressWarnings("unchecked")
    public void start(Stage stage) throws Exception {
        var watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("COIN_GAME_TIMEOUT");
            System.exit(1);
        });
        watchdog.setDaemon(true);
        watchdog.start();
        var app = new Main();
        try {
            app.start(stage);
            app.pause();
            var keys = (Set<KeyCode>) field(app, GameApp.class, "keys");
            var controls = (HBox) app.layout().getBottom();
            var restart = (Button) controls.getChildren().get(2);
            require(!restart.isDisabled(), "Restart remains enabled while simulation is paused");
            requireReset(app);
            app.draw();
            var pixels = app.canvas().snapshot(null, null).getPixelReader();
            require(pixels.getColor(45, 185).equals(Color.CORNFLOWERBLUE), "Player drawn");
            require(pixels.getColor(225, 185).equals(Color.GOLD), "Coin drawn");
            require(pixels.getColor(300, 200).equals(Color.ALICEBLUE), "Background drawn");

            var edge = new Player(40, 180);
            edge.update(-1, -1, 100, 640, 400);
            require(coordinate(edge, "x") == 0 && coordinate(edge, "y") == 0,
                    "Left/top bounds");
            edge.update(1, 1, 100, 640, 400);
            require(coordinate(edge, "x") == 616 && coordinate(edge, "y") == 376,
                    "Right/bottom bounds");
            require(new Player(196, 180).touches(220, 180, 24), "Edge contact collects");
            require(new Player(244, 180).touches(220, 180, 24), "Right edge contact");
            require(new Player(220, 156).touches(220, 180, 24), "Top edge contact");
            require(new Player(220, 204).touches(220, 180, 24), "Bottom edge contact");
            require(new Player(196, 156).touches(220, 180, 24), "Corner contact");
            require(!new Player(195, 180).touches(220, 180, 24), "Horizontal near miss");
            require(!new Player(220, 155).touches(220, 180, 24), "Vertical near miss");

            walk(app, keys, KeyCode.RIGHT, 10);
            require((int) field(app, Main.class, "points") == 1, "One coin scores once");
            app.update(0.1);
            require((int) field(app, Main.class, "points") == 1, "Standing on coin cannot rescore");
            walk(app, keys, KeyCode.RIGHT, 2); // Uncover the old coin position.
            app.draw();
            require(app.canvas().snapshot(null, null).getPixelReader().getColor(230, 185)
                    .equals(Color.ALICEBLUE), "Collected coin disappears");
            restart.fire();
            requireReset(app);

            for (int round = 0; round < 2; round++) {
                walk(app, keys, KeyCode.RIGHT, 10);
                walk(app, keys, KeyCode.RIGHT, 12);
                walk(app, keys, KeyCode.UP, 5);
                require((int) field(app, Main.class, "points") == 2, "Second coin scores");
                walk(app, keys, KeyCode.DOWN, 12);
                walk(app, keys, KeyCode.RIGHT, 6);
                require((int) field(app, Main.class, "points") == 3
                        && (boolean) field(app, Main.class, "won"), "All coins win");
                require(((Label) field(app, Main.class, "score")).getText().equals("Score: 3 / 3")
                        && ((Label) field(app, Main.class, "message")).getText()
                                .equals("You win! Choose Restart."), "Winning labels");
                var player = (Player) field(app, Main.class, "player");
                double x = coordinate(player, "x");
                double y = coordinate(player, "y");
                walk(app, keys, KeyCode.LEFT, 3);
                require(coordinate(player, "x") == x && coordinate(player, "y") == y,
                        "Win freezes movement");
                app.draw();
                require((int) field(app, Main.class, "points") == 3, "Win cannot rescore");
                restart.fire();
                requireReset(app);
            }
            walk(app, keys, KeyCode.UP, 1);
            require(coordinate((Player) field(app, Main.class, "player"), "y") == 162,
                    "Movement resumes after restart");
            System.out.println("COIN_GAME_OK bounds contact score once win restart drawing");
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
