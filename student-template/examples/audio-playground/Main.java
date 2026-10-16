import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.scene.text.Font;
import zero.Music;
import zero.App;
import zero.Sound;

/** Ordinary controls and event handlers; Zero owns the native audio resources. */
public class Main extends App {
    Sound chime;
    Music theme;
    boolean muted;

    @Override public void settings() { title("Audio playground"); size(540, 220); padding(24); }
    @Override public void setup() {
        chime = loadSound("/audio-playground/chime.wav");
        theme = loadMusic("/audio-playground/theme.wav");
        chime.setVolume(0.5);
        theme.setVolume(0.25);
        Label heading = new Label("Music and sound"); heading.setFont(Font.font(26));
        Button sound = new Button("Play sound"); sound.setOnAction(event -> chime.play());
        Button loop = new Button("Loop music"); loop.setOnAction(event -> theme.loop());
        Button pause = new Button("Pause music"); pause.setOnAction(event -> theme.pause());
        Button resume = new Button("Resume music"); resume.setOnAction(event -> theme.play());
        Button stop = new Button("Stop music"); stop.setOnAction(event -> theme.stop());
        Button mute = new Button("Mute");
        mute.setOnAction(event -> {
            muted = !muted;
            chime.setMuted(muted); theme.setMuted(muted);
            mute.setText(muted ? "Unmute" : "Mute");
        });
        show(new VBox(18, heading, new HBox(10, sound, loop, pause), new HBox(10, resume, stop, mute)));
    }
    public static void main(String[] args) { launch(args); }
}
