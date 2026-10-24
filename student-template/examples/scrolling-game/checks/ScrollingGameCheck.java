import java.util.Set;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.control.Label;
import javafx.scene.image.Image;
import javafx.scene.input.KeyCode;
import javafx.scene.media.AudioClip;
import javafx.scene.paint.Color;
import javafx.stage.Stage;
import zero.GameApp;

/** Finite native check with deterministic held input and explicit simulation time. */
public class ScrollingGameCheck extends Application {
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


    @Override @SuppressWarnings("unchecked") public void start(Stage stage) throws Exception {
        var watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("SCROLLING_GAME_OK_TIMEOUT"); System.exit(1);
        });
        watchdog.setDaemon(true); watchdog.start();
        var app = new Main();
        try {
            app.start(stage); app.pause();
            var keys = (Set<KeyCode>) field(app, GameApp.class, "keys");
            cameraChecks(); drawingChecks(app);
            var player = (Player) field(app, "player");
            keys.add(KeyCode.A); app.update(0.1); close(player.x(), 20, "A moves left");
            keys.clear(); keys.add(KeyCode.D);
            for (int frame = 0; frame < 8; frame++) app.update(0.1);
            require((int) field(app, "points") == 1, "Coin contact scores once");
            keys.clear(); app.update(0.1);
            require((int) field(app, "points") == 1, "Standing on coin cannot rescore");
            keys.add(KeyCode.RIGHT);
            for (int frame = 0; frame < 80; frame++) app.update(0.1);
            require((int) field(app, "points") == 3, "Scrolling world contains three collectible coins");
            close(player.x(), 1568, "Whole player stays within world");
            close(((Camera) field(app, "camera")).x(), 960, "Camera reaches far world edge");
            require(((Label) field(app, "message")).getText().startsWith("All coins"), "Completion message");
            var small = new Player(10, 10);
            small.update(1, 100, 20); close(small.x(), 0, "Player handles small world bounds");

            System.out.println("SCROLLING_GAME_OK camera HUD drawing cached assets input behavior");
        } catch (Throwable failure) {
            failure.printStackTrace(); System.exit(1);
        } finally {
            ((AudioClip) field(app, "sound")).stop();
            app.stop(); stage.close(); Platform.exit();
        }
    }
    public static void main(String[] args) { launch(args); }
}
