import java.lang.reflect.InvocationTargetException;
import javafx.animation.PauseTransition;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.image.Image;
import javafx.scene.layout.HBox;
import javafx.scene.media.AudioClip;
import javafx.scene.paint.Color;
import javafx.stage.Stage;
import javafx.util.Duration;

/** Finite native check. Playback state is not proof of audible device output. */
public class MediaDemoCheck extends Application {
    private Main app;
    private Stage stage;
    private AudioClip sound;
    private boolean observedPlayback;
    private long playbackDeadline;

    private static Object field(Main app, String name) throws Exception {
        var field = Main.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(app);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private void fail(Throwable failure) {
        failure.printStackTrace();
        System.exit(1);
    }

    @Override public void start(Stage stage) {
        this.stage = stage;
        var watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("MEDIA_DEMO_TIMEOUT");
            System.exit(1);
        });
        watchdog.setDaemon(true);
        watchdog.start();
        try {
            app = new Main();
            app.start(stage);
            app.pause(); // Freeze automatic updates while ordinary controls remain live.
            var sprite = (Image) field(app, "sprite");
            sound = (AudioClip) field(app, "sound");
            require(sprite.getWidth() == 32 && sprite.getHeight() == 32, "Bundled image loaded");
            require(sound.getSource().endsWith("/media-demo/chime.wav"), "Bundled audio loaded");
            require(sound.getVolume() == 0.25, "Moderate default volume");
            app.draw();
            var pixels = app.canvas().snapshot(null, null).getPixelReader();
            require(pixels.getColor(125, 150).equals(Color.rgb(99, 65, 230)), "Scaled sprite drawn");
            require(pixels.getColor(90, 110).equals(Color.ALICEBLUE), "Sprite transparency");
            var loader = Main.class.getDeclaredMethod("loadEffect", String.class);
            loader.setAccessible(true);
            for (String path : new String[] {"/media-demo/missing.wav", "/media-demo/player.png"}) {
                try {
                    loader.invoke(app, path);
                    throw new AssertionError("Invalid sound must fail: " + path);
                } catch (InvocationTargetException expected) {
                    require(expected.getCause() instanceof IllegalArgumentException
                            && expected.getCause().getMessage().contains(path), "Useful sound error");
                }
            }
            var controls = (HBox) app.layout().getBottom();
            var play = (Button) controls.getChildren().get(0);
            var status = (Label) controls.getChildren().get(1);
            require(status.getText().equals("Plays: 0"), "Initial count");
            // Mute this automated check; a student must verify device output.
            sound.setVolume(0);
            require(!play.isDisabled(), "Play sound remains enabled while simulation is paused");
            play.fire();
            play.fire();
            require(status.getText().equals("Plays: 2") && (int) field(app, "plays") == 2,
                    "Each click updates state once");
            require(field(app, "sprite") == sprite && field(app, "sound") == sound,
                    "Assets reused rather than reloaded");
            playbackDeadline = System.nanoTime() + 5_000_000_000L;
            pollPlayback();
        } catch (Throwable failure) { fail(failure); }
    }

    private void pollPlayback() {
        var wait = new PauseTransition(Duration.millis(10));
        wait.setOnFinished(event -> {
            try {
                observedPlayback |= sound.isPlaying();
                // Native audio startup/buffering differs across platforms.
                if ((!observedPlayback || sound.isPlaying())
                        && System.nanoTime() < playbackDeadline) {
                    pollPlayback();
                    return;
                }
                require(observedPlayback, "Native AudioClip entered playback");
                require(!sound.isPlaying(), "Short effect finished");
                sound.stop();
                app.stop();
                stage.close();
                System.out.println("MEDIA_DEMO_OK sprite transparency cached assets errors clicks playback finish");
                Platform.exit();
            } catch (Throwable failure) { fail(failure); }
        });
        wait.play();
    }

    public static void main(String[] args) { launch(args); }
}
