import evidence.ApiProof;
import evidence.ApiSignatureChecks;
import evidence.ApiCompletionChecks;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.paint.Color;
import zero.Music;
import zero.Sound;
import zero.App;
import zero.GameApp;

/** Ordinary public audio API exercised through real browser media and app ownership. */
public final class Main extends GameApp {
    private Sound effect;
    private Music song, once, independent, broken;
    private final Label result = new Label("Audio checks preparing");
    private int checks;
    private boolean failed;
    @Override public void settings() { title("Zero web audio"); size(680, 260); }
    @Override public void setup() {
        ApiSignatureChecks.audio(this,"/audio/tone.wav");
        Sound closed = loadSound("/audio/tone.wav"); closed.close(); closed.close();
        effect = loadSound("audio/tone.wav");
        require(effect != closed, "closed effect reload");
        require(effect == loadSound("/audio/./tone.wav") && effect == loadSound("/audio/nested/../tone.wav"), "effect resource aliases");
        effect.setVolume(.23); require(loadSound("audio/tone.wav").getVolume() == .23, "cached effect volume");
        Owner owner = new Owner() { };
        Sound other = owner.loadSound("/audio/tone.wav"); require(other != effect, "per app effect ownership");
        owner.stop(); owner.stop(); require(owner.shutdowns == 1 && closed(other), "owner cleanup once");
        Sound late = owner.loadSound("/audio/tone.wav"); owner.stop(); require(closed(late) && owner.shutdowns == 1, "resources loaded after stop");
        song = loadMusic("/audio/tone.wav"); independent = loadMusic("audio/./tone.wav"); once = loadMusic("audio/tone.wav");
        require(song != independent && song != once, "independent music identity");
        song.setVolume(.19); song.setMuted(true); require(song.getVolume() == .19 && song.isMuted(), "music volume and mute getters");
        ApiCompletionChecks.musicLoop(song); song.stop(); ApiCompletionChecks.musicPlay(song); // Final pre-ready intent and repeat selection survive.
        independent.play(); independent.pause(); independent.stop();
        for (double value : new double[] {-1, 1.01, Double.NaN, Double.POSITIVE_INFINITY}) {
            try { effect.setVolume(value); throw new IllegalStateException("Invalid effect volume accepted"); } catch (IllegalArgumentException expected) { checks++; }
            try { song.setVolume(value); throw new IllegalStateException("Invalid music volume accepted"); } catch (IllegalArgumentException expected) { checks++; }
        }
        try { loadSound("/audio/missing.wav"); throw new IllegalStateException("Missing sound accepted"); }
        catch (IllegalArgumentException expected) { require(expected.getMessage().contains("missing.wav"), "named missing resource"); }
        broken = loadMusic("/audio/broken.wav");
        Button twice = button("Play twice", () -> { ApiCompletionChecks.soundPlay(effect); effect.play(); });
        Button stopEffects=button("Stop effects",()->ApiCompletionChecks.soundStop(effect));
        Button spam = button("Spam effects", () -> { for (int i = 0; i < 100; i++) effect.play(); });
        Button loop = button("Loop", () -> { song.setMuted(false); song.loop(); });
        Button pause = button("Pause", () -> ApiCompletionChecks.musicPause(song));
        Button play = button("Resume", () -> song.play());
        Button stop = button("Rewind", () -> ApiCompletionChecks.musicStop(song));
        Button mute = button("Mute", () -> { effect.setMuted(!effect.isMuted()); song.setMuted(!song.isMuted()); });
        Button one = button("Once", () -> once.play());
        Button error = button("Check error", () -> {
            try { broken.play(); result.setText("Failure not delivered yet"); }
            catch (IllegalStateException expected) { failed = expected.getMessage().contains("broken.wav"); result.setText("Named late failure: " + failed); }
        });
        Button lateError = button("Check late", () -> {
            try { once.play(); result.setText("Late failure not delivered"); }
            catch (IllegalStateException expected) { result.setText("Named playing failure: " + expected.getMessage().contains("tone.wav")); }
        });
        Button cleanup = button("Stop app", () -> { stop(); result.setText("App cleanup: " + (closed(effect) && closed(song) && closed(once) && closed(independent))); });
        layout().setBottom(new HBox(4, twice, stopEffects, spam, loop, pause, play, stop, mute, one, error, lateError, cleanup));
        layout().setTop(result);
        result.setText("Audio checks ready: " + checks);
        canvas().setAccessibleText("Zero audio browser fixture");
    }
    private Button button(String text, Runnable action) { Button button = new Button(text); button.setOnAction(event -> action.run()); return button; }
    private void require(boolean value, String message) { if (!value) throw new IllegalStateException(message); checks++; }
    private boolean closed(Sound sound) { try { sound.play(); return false; } catch (IllegalStateException expected) { return !sound.isPlaying(); } }
    private boolean closed(Music music) { try { music.play(); return false; } catch (IllegalStateException expected) { return !music.isPlaying(); } }
    @Override public void draw() {
        text(ApiProof.events(),-10000,-10000);
        background(Color.WHITE); fill(Color.BLACK); textSize(20);
        text("Audio API ready: " + checks, 10, 30);
        text("Effect playing: " + effect.isPlaying(), 10, 65);
        text("Music playing: " + song.isPlaying(), 10, 100);
        text("Once playing: " + once.isPlaying(), 10, 135);
        text("Independent playing: " + independent.isPlaying(), 10, 170);
        text("Muted: " + song.isMuted() + " / " + effect.isMuted(), 10, 205);
    }
    private abstract static class Owner extends App { int shutdowns; @Override protected void shutdown() { shutdowns++; } }
    public static void main(String[] args) { launch(args); }
}
