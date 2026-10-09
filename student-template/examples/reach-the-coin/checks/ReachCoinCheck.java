import java.util.Set;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.input.KeyCode;
import javafx.scene.paint.Color;
import javafx.stage.Stage;
import zero.SketchApp;

/** Maintainer-only deterministic checks; never copied into a student's app. */
public class ReachCoinCheck extends Application {
    private static void saveCanvas(Main app, String filename) throws Exception {
        var image = app.canvas().snapshot(null, null);
        var pixels = image.getPixelReader();
        var output = new java.awt.image.BufferedImage(640, 400,
                java.awt.image.BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < 400; y++) {
            for (int x = 0; x < 640; x++) output.setRGB(x, y, pixels.getArgb(x, y));
        }
        javax.imageio.ImageIO.write(output, "png", new java.io.File(filename));
    }

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

    @Override
    @SuppressWarnings("unchecked")
    public void start(Stage stage) throws Exception {
        Main app = new Main();
        try {
            app.start(stage);
            app.stop(); // Stop automatic frames so each test chooses elapsed time.
            app.draw();
            saveCanvas(app, "initial.png");
            Set<KeyCode> keys = (Set<KeyCode>) field(app, SketchApp.class, "keys");
            Player player = (Player) field(app, Main.class, "player");
            require(coordinate(player, "x") == 40 && coordinate(player, "y") == 180,
                    "Start position");
            keys.add(KeyCode.RIGHT);
            app.update(0.1);
            require(coordinate(player, "x") == 58, "Right movement uses elapsed time");
            keys.add(KeyCode.LEFT);
            app.update(0.1);
            require(coordinate(player, "x") == 58, "Opposite arrows cancel");
            keys.clear(); keys.add(KeyCode.LEFT); keys.add(KeyCode.UP);
            app.update(0.1);
            require(coordinate(player, "x") == 40 && coordinate(player, "y") == 162,
                    "Left and up move diagonally");
            keys.clear(); keys.add(KeyCode.DOWN);
            app.update(0.1);
            require(coordinate(player, "y") == 180, "Down movement");
            keys.clear();
            app.update(0.1);
            require(coordinate(player, "x") == 40 && coordinate(player, "y") == 180,
                    "No input keeps position");

            Player edge = new Player(40, 180);
            edge.update(-1, -1, 100, 640, 400);
            require(coordinate(edge, "x") == 0 && coordinate(edge, "y") == 0,
                    "Left/top bounds contain the whole square");
            edge.update(1, 1, 100, 640, 400);
            require(coordinate(edge, "x") == 616 && coordinate(edge, "y") == 376,
                    "Right/bottom bounds contain the whole square");
            require(new Player(496, 180).touches(520, 180, 24), "Left edge contact");
            require(new Player(544, 180).touches(520, 180, 24), "Right edge contact");
            require(new Player(520, 156).touches(520, 180, 24), "Top edge contact");
            require(new Player(520, 204).touches(520, 180, 24), "Bottom edge contact");
            require(new Player(496, 156).touches(520, 180, 24), "Corner contact");
            require(new Player(530, 190).touches(520, 180, 24), "Overlap contact");
            require(!new Player(495, 180).touches(520, 180, 24), "Horizontal near miss");
            require(!new Player(520, 155).touches(520, 180, 24), "Vertical near miss");

            // Win, freeze, restart and win again using Main's real update path.
            for (int round = 0; round < 2; round++) {
                keys.clear(); keys.add(KeyCode.RIGHT);
                for (int frame = 0; frame < 26; frame++) app.update(0.1);
                require((boolean) field(app, Main.class, "won"), "Reach coin wins");
                player = (Player) field(app, Main.class, "player");
                double wonX = coordinate(player, "x");
                keys.add(KeyCode.DOWN);
                app.update(0.1);
                require(coordinate(player, "x") == wonX && coordinate(player, "y") == 180,
                        "Win freezes both coordinates");
                app.draw();
                if (round == 0) saveCanvas(app, "won.png");
                require(app.canvas().snapshot(null, null).getPixelReader()
                        .getColor((int) wonX + 5, 185).equals(Color.CORNFLOWERBLUE),
                        "Winning player stays visible");
                keys.add(KeyCode.R);
                app.update(0.1);
                app.update(0.1);
                player = (Player) field(app, Main.class, "player");
                require(!(boolean) field(app, Main.class, "won")
                        && coordinate(player, "x") == 40 && coordinate(player, "y") == 180,
                        "Held restart resets state even with arrows held");
                keys.clear();
                app.draw();
                var pixels = app.canvas().snapshot(null, null).getPixelReader();
                require(pixels.getColor(45, 185).equals(Color.CORNFLOWERBLUE), "Player draw");
                require(pixels.getColor(525, 185).equals(Color.GOLD), "Fixed coin draw");
                require(pixels.getColor(300, 200).equals(Color.ALICEBLUE), "Background draw");
            }
            keys.add(KeyCode.UP); app.update(0.1);
            require(coordinate(player, "y") == 162, "Movement resumes after restart release");
            keys.add(KeyCode.R); app.update(0.1);
            require(coordinate((Player) field(app, Main.class, "player"), "y") == 180,
                    "Restart also works before winning");
            System.out.println("REACH_COIN_OK movement bounds contact freeze restart drawing");
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
