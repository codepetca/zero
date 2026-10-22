import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.image.Image;
import javafx.scene.layout.HBox;
import javafx.scene.media.AudioClip;
import javafx.scene.media.MediaException;
import javafx.scene.paint.Color;
import zero.GameApp;

/** Load small local assets once. Main owns the button action and drawing. */
public class Main extends GameApp {
    private Image sprite;
    private AudioClip sound;
    private int plays;

    @Override public void settings() {
        padding(20);
        title("My sprite and sound");
        size(640, 360);
    }

    @Override public void setup() {
        sprite = loadImage("/media-demo/player.png");
        sound = loadEffect("/media-demo/chime.wav");
        sound.setVolume(0.25);
        var status = new Label("Plays: 0");
        var play = new Button("Play sound");
        play.setOnAction(event -> {
            sound.stop(); // A new click replaces the previous short effect.
            sound.play();
            plays++;
            status.setText("Plays: " + plays);
        });
        var controls = new HBox(12, play, status);
        controls.setPadding(new Insets(12));
        layout().setBottom(controls);
    }

    @Override public void draw() {
        background(Color.ALICEBLUE);
        image(sprite, 80, 100, 96, 96);
        fill(Color.DARKSLATEGRAY);
        textSize(20);
        text("Your image. Your sound.", 80, 60);
    }

    private AudioClip loadEffect(String path) {
        var resource = getClass().getResource(path);
        if (resource == null) {
            throw new IllegalArgumentException("Sound resource not found: " + path);
        }
        try {
            return new AudioClip(resource.toExternalForm());
        } catch (MediaException failure) {
            throw new IllegalArgumentException("Cannot load sound: " + path, failure);
        }
    }

    public static void main(String[] args) { launch(args); }
}
