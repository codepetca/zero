import java.util.Set;
import javafx.application.Application;
import javafx.scene.control.Label;
import javafx.scene.image.Image;
import javafx.scene.input.KeyCode;
import javafx.scene.media.AudioClip;
import javafx.scene.paint.Color;
import javafx.stage.Stage;
import zero.GameApp;

/** Finite native check with deterministic held input and explicit simulation time. */
public class LevelGameCheck extends Application {
    private static Object field(Object object, Class<?> type, String name) throws Exception {
        var field = type.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(object);
    }
    private static Object field(Main app, String name) throws Exception {
        return field(app, Main.class, name);
    }
    private static void put(Main app, String name, Object value) throws Exception {
        var field = Main.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(app, value);
    }
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static void close(double actual, double expected, String message) {
        require(Math.abs(actual - expected) < 0.00001, message + ": " + actual);
    }
    private static void cameraChecks() {
        var camera = new Camera();
        camera.follow(40, 40, 640, 360, 1600, 600);
        close(camera.x(), 0, "Camera left clamp");
        close(camera.y(), 0, "Camera top clamp");
        camera.follow(800, 300, 640, 360, 1600, 600);
        close(camera.x(), 480, "Camera follows world centre");
        close(camera.y(), 120, "Camera vertical follow");
        camera.follow(2000, 900, 640, 360, 1600, 600);
        close(camera.x(), 960, "Camera right clamp");
        close(camera.y(), 240, "Camera bottom clamp");
        camera.follow(150, 150, 640, 360, 200, 100);
        close(camera.x(), 0, "Small world horizontal clamp");
        close(camera.y(), 0, "Small world vertical clamp");
    }
    private static void drawingChecks(Main app) throws Exception {
        var camera = (Camera) field(app, "camera");
        var hud = app.layout().getBottom();
        double hudX = hud.getLayoutX(), hudY = hud.getLayoutY();
        camera.follow(800, 180, app.width(), app.height(), 1600, 360);
        var before = app.graphics().getTransform();
        app.draw(); app.draw();
        var after = app.graphics().getTransform();
        close(after.getTx(), before.getTx(), "Drawing restores horizontal transform");
        close(after.getTy(), before.getTy(), "Drawing restores vertical transform");
        close(after.getMxx(), before.getMxx(), "Drawing restores scale");
        require(hud.getLayoutX() == hudX && hud.getLayoutY() == hudY,
                "Native HUD stays fixed while world camera moves");
        camera.follow(0, 0, app.width(), app.height(), 1600, 360);
        app.draw();
        var player = (Player) field(app, "player");
        var pixels = app.canvas().snapshot(null, null).getPixelReader();
        require(pixels.getColor((int) player.x() + 15, (int) player.y() + 16)
                .equals(Color.rgb(99, 65, 230)), "Cached player sprite drawn");
        var sprite = (Image) field(app, "sprite");
        require(sprite.getWidth() == 32 && sprite.getHeight() == 32, "Canonical PNG loaded");
        var sound = (AudioClip) field(app, "sound");
        require(sound.getVolume() == 0.25, "Moderate effect volume");
        require(sound.getSource().endsWith("/media-demo/chime.wav"), "Canonical WAV loaded");
        sound.setVolume(0); // This check does not claim audible output.
        var loader = Main.class.getDeclaredMethod("loadEffect", String.class);
        loader.setAccessible(true);
        try {
            loader.invoke(app, "/media-demo/missing.wav");
            throw new AssertionError("Missing sound must fail");
        } catch (java.lang.reflect.InvocationTargetException expected) {
            require(expected.getCause().getMessage().contains("/media-demo/missing.wav"),
                    "Sound error includes resource path");
        }
        app.draw();
        require(field(app, "sprite") == sprite && field(app, "sound") == sound, "Assets cached");
    }
    private static void physicsChecks() {
        var floor = new Platform(0, 300, 400, 60);
        var solids = new Platform[] { floor };
        var player = new Player(50, 268);
        player.update(0, false, 0.1, 1600, solids);
        require(player.isGrounded(), "Floor contact establishes grounded state");
        close(player.y(), 268, "Floor response stops penetration");
        player.update(0, true, 0.1, 1600, solids);
        require(!player.isGrounded() && player.y() < 268, "Grounded jump rises");
        double airborneY = player.y();
        player.update(0, true, 0.01, 1600, solids);
        require(player.y() < airborneY, "Airborne jump cannot reset velocity");
        for (int frame = 0; frame < 15; frame++) player.update(0, false, 0.1, 1600, solids);
        require(player.isGrounded(), "Gravity lands on floor");
        close(player.y(), 268, "Landing has no floor penetration");
        var wall = new Platform(140, 100, 20, 200);
        player = new Player(100, 200);
        player.update(1, false, 0.1, 1600, new Platform[] { wall, floor });
        close(player.x(), 108, "Right wall stops player");
        player = new Player(170, 200);
        player.update(-1, false, 0.1, 1600, new Platform[] { wall, floor });
        close(player.x(), 160, "Left wall stops player");
        player = new Player(50, 268);
        var ceiling = new Platform(0, 200, 200, 20);
        var room = new Platform[] { floor, ceiling };
        player.update(0, false, 0.1, 1600, room);
        player.update(0, true, 0.1, 1600, room);
        require(player.y() >= 220, "Head response blocks ceiling");
        player.update(0, false, 0.1, 1600, room);
        require(player.y() > 220, "Head contact clears upward velocity");
        player = new Player(420, 268);
        for (int frame = 0; frame < 10; frame++) player.update(0, false, 0.1, 1600, solids);
        require(player.y() > 360 && !player.isGrounded(), "Gaps fall instead of creating invisible floor");
        var fast = new Player(40, 268);
        fast.update(1, false, 10, 1600, solids);
        close(fast.x(), 60, "Oversized frame capped at 0.1s");
        var whole = new Player(40, 268);
        var split = new Player(40, 268);
        whole.update(1, false, 0.1, 1600, solids);
        for (int step = 0; step < 12; step++) split.update(1, false, 1.0 / 120, 1600, solids);
        close(whole.x(), split.x(), "Substep movement deterministic");
        close(whole.y(), split.y(), "Substep gravity deterministic");
        var landing = new Player(50, 0);
        for (int frame = 0; frame < 12; frame++) landing.update(0, false, 0.1, 1600, solids);
        close(landing.y(), 268, "Fast capped frames cannot tunnel through floor");
    }
    private static void jumpInputChecks(Main app, Set<KeyCode> keys) throws Exception {
        var player = (Player) field(app, "player");
        keys.clear(); app.update(0.1);
        require(player.isGrounded(), "App starts grounded");
        keys.add(KeyCode.SPACE); app.update(0.1);
        require(player.y() < 268, "Space rising edge jumps");
        for (int frame = 0; frame < 15; frame++) app.update(0.1);
        require(player.isGrounded(), "Held Space does not bounce after landing");
        keys.clear(); app.update(0.01);
        keys.add(KeyCode.UP); app.update(0.1);
        require(!player.isGrounded(), "Release then Up permits another jump");
        keys.clear();
    }

    private static Level current(Main app) throws Exception {
        return ((Level[]) field(app, "levels"))[(int) field(app, "levelIndex")];
    }
    private static void collectLevel(Main app) throws Exception {
        for (Coin coin : current(app).coins) {
            double x = (double) field(coin, Coin.class, "x");
            double y = (double) field(coin, Coin.class, "y");
            put(app, "player", new Player(x, y));
            app.update(0);
        }
    }
    private static void exitLevel(Main app) throws Exception {
        var level = current(app);
        put(app, "player", new Player(level.exitX, level.exitY));
        app.update(0);
    }
    private static void scoreMatches(Main app, int expected) throws Exception {
        require((int) field(app, "points") == expected, "App score: " + expected);
        var display = (ScoreDisplay) field(app, "score");
        require(((Label) display.view()).getText().equals("Score: " + expected), "Native score: " + expected);
    }

    @Override @SuppressWarnings("unchecked") public void start(Stage stage) throws Exception {
        var watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("LEVEL_GAME_OK_TIMEOUT"); System.exit(1);
        });
        watchdog.setDaemon(true); watchdog.start();
        var app = new Main();
        try {
            app.start(stage); app.pause();
            var keys = (Set<KeyCode>) field(app, GameApp.class, "keys");
            cameraChecks(); drawingChecks(app);
            physicsChecks(); jumpInputChecks(app, keys);
            var enemy = new Enemy(100, 200, 272);
            enemy.update(2); close(enemy.x(), 200, "Patrol right bound");
            enemy.update(2); close(enemy.x(), 100, "Patrol left bound");
            exitLevel(app); require((int) field(app, "levelIndex") == 0, "Exit requires every coin");
            collectLevel(app); scoreMatches(app, 4);
            app.update(0); scoreMatches(app, 4);
            exitLevel(app); require((int) field(app, "levelIndex") == 1, "Exit advances level");
            scoreMatches(app, 4);
            close(((Player) field(app, "player")).x(), 40, "Level restores spawn");
            close(((Camera) field(app, "camera")).x(), 0, "Level restores camera");
            var second = current(app);
            put(app, "player", new Player(150, 268)); app.update(0); scoreMatches(app, 5);
            put(app, "player", new Player(second.enemies[0].x(), 272)); app.update(0);
            require((int) field(app, "levelIndex") == 1, "Enemy retries current level");
            scoreMatches(app, 4);
            require(!current(app).coins[0].isCollected(), "Retry restores current-level coins");
            close(current(app).enemies[0].x(), 470, "Retry restores enemy patrol");
            put(app, "player", new Player(700, 361)); app.update(0);
            require((int) field(app, "levelIndex") == 1, "Fall retries current level");
            scoreMatches(app, 4);
            collectLevel(app); scoreMatches(app, 8); exitLevel(app);
            require((int) field(app, "levelIndex") == 0, "Final practice exit wraps to fresh run");
            scoreMatches(app, 0);
            collectLevel(app); exitLevel(app); collectLevel(app); exitLevel(app);
            scoreMatches(app, 0); require((int) field(app, "levelIndex") == 0, "Second complete run wraps");

            System.out.println("LEVEL_GAME_OK camera HUD drawing cached assets input behavior");
        } catch (Throwable failure) {
            failure.printStackTrace(); System.exit(1);
        } finally {
            ((AudioClip) field(app, "sound")).stop();
            app.stop(); stage.close(); javafx.application.Platform.exit();
        }
    }
    public static void main(String[] args) { launch(args); }
}
