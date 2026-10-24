package zero;

import evidence.ApiSignatureChecks;
import evidence.ApiNative;
import evidence.ApiProof;
import evidence.ApiCompletionChecks;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.sound.sampled.AudioFileFormat;
import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import javafx.animation.AnimationTimer;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.control.Label;
import javafx.scene.media.AudioClip;
import javafx.scene.media.MediaPlayer;
import javafx.stage.Stage;

/** Finite native-media checks. WAV fixtures are generated only in the disposable build output. */
public final class AudioCheck extends Application {
    private Owner owner;
    private Sound sound;
    private Music music, once, preStopped, broken, callbackFailure;
    private MediaPlayer nativeMusic, nativeOnce;
    private int phase, checks;
    private long entered;
    private double pausedAt;
    private int repeats;
    private boolean replayRewound,soundStopStarted;
    private Stage ownerStage, failingStage;
    private FailingGame failing;
    private int frameErrors;
    private Thread.UncaughtExceptionHandler previousHandler;

    static class Owner extends App {
        int shutdowns;
        @Override protected void shutdown() { shutdowns++; }
        @Override public void setup() { show(new Label("Finite Zero audio checks")); }
    }
    @Override public void start(Stage unused) throws Exception {
        Platform.setImplicitExit(false);
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(25_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_AUDIO_TIMEOUT phase=" + phase); System.exit(1);
        }, "zero-audio-deadline");
        watchdog.setDaemon(true); watchdog.start();
        Path resources = Path.of(getClass().getResource("/").toURI());
        Path fixture = resources.resolve("zero/audio-check.wav");
        int frames = 44_100;
        byte[] pcm = new byte[frames * 4];
        for (int frame = 0; frame < frames; frame++) {
            short value = (short) (Math.sin(frame * 2 * Math.PI * 330 / 44_100) * 100);
            for (int channel = 0; channel < 2; channel++) {
                pcm[frame * 4 + channel * 2] = (byte) value;
                pcm[frame * 4 + channel * 2 + 1] = (byte) (value >> 8);
            }
        }
        try (AudioInputStream audio = new AudioInputStream(new ByteArrayInputStream(pcm),
                new AudioFormat(44_100, 16, 2, true, false), frames)) {
            AudioSystem.write(audio, AudioFileFormat.Type.WAVE, fixture.toFile());
        }
        Files.writeString(resources.resolve("zero/broken-audio.wav"), "broken audio");
        byte[] malformed = Files.readAllBytes(fixture);
        malformed[20] = (byte) 0xff; malformed[21] = (byte) 0xff; // Invalid WAV encoding after a valid container signature.
        Files.write(resources.resolve("zero/broken-decode.wav"), malformed);
        owner = new Owner(); ownerStage = new Stage(); owner.start(ownerStage);
        ApiSignatureChecks.audio(owner,"/zero/audio-check.wav");
        sound = owner.loadSound("/zero/audio-check.wav");
        require(sound == owner.loadSound("audio-check.wav") && sound == owner.loadSound("/zero/../zero/audio-check.wav"), "sound canonical aliases");
        sound.setVolume(.12); require(owner.loadSound("audio-check.wav").getVolume() == .12, "cached settings shared");
        Owner other = new Owner(); Sound otherSound = other.loadSound("audio-check.wav");
        require(otherSound != sound, "sound belongs to app"); other.stop(); require(otherSound.isClosed(), "other app ownership");
        Sound closed = owner.loadSound("audio-check.wav"); closed.close(); closed.close();
        sound = owner.loadSound("audio-check.wav"); require(sound != closed, "closed sound reload");
        expect(IllegalStateException.class, closed::play, "closed sound");
        for (double value : new double[] {-1, 1.1, Double.NaN, Double.POSITIVE_INFINITY}) {
            expect(IllegalArgumentException.class, () -> sound.setVolume(value), "sound volume");
        }
        expect(IllegalArgumentException.class, () -> owner.loadSound("missing.wav"), "missing sound");
        expect(IllegalArgumentException.class, () -> owner.loadMusic("missing.wav"), "missing music");
        expect(IllegalArgumentException.class, () -> owner.loadMusic(null), "null music path");
        expect(IllegalArgumentException.class, () -> owner.loadSound(" "), "blank sound path");
        expect(IllegalArgumentException.class, () -> owner.loadSound("broken-audio.wav"), "decoding sound");
        expect(IllegalArgumentException.class, () -> owner.loadMusic("broken-audio.wav"), "decoding music");
        try { broken = owner.loadMusic("broken-decode.wav"); broken.play(); }
        catch (IllegalArgumentException expected) { require(expected.getMessage().contains("broken-decode.wav"), "decode error includes resource"); }
        callbackFailure = owner.loadMusic("audio-check.wav");
        Runnable reportFailure = player(callbackFailure).getOnError();
        // Fault injection into the installed async callback; native malformed-file failures may be synchronous.
        Platform.runLater(() -> { reportFailure.run(); reportFailure.run(); });
        music = owner.loadMusic("audio-check.wav"); once = owner.loadMusic("/zero/audio-check.wav");
        preStopped = owner.loadMusic("audio-check.wav");
        nativeMusic = player(music); nativeOnce = player(once);
        require(music != once && nativeMusic != nativeOnce, "independent music players");
        for (double value : new double[] {-1, 1.1, Double.NaN, Double.NEGATIVE_INFINITY}) {
            expect(IllegalArgumentException.class, () -> music.setVolume(value), "music volume");
        }
        music.setVolume(.05); music.setMuted(true);
        require(music.getVolume() == .05 && music.isMuted() && nativeMusic.isMute(), "music mute retains volume");
        ApiCompletionChecks.musicLoop(music); music.stop(); ApiCompletionChecks.musicPlay(music); // Commands before READY retain final intent and loop mode.
        once.play(); once.pause(); preStopped.loop(); preStopped.stop();
        require(nativeMusic.getCycleCount() == MediaPlayer.INDEFINITE, "stop retains loop mode");
        sound.setVolume(.01); ApiCompletionChecks.soundPlay(sound);
        entered = System.nanoTime();
        new AnimationTimer() {
            @Override public void handle(long now) {
                try { pulse(now); }
                catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
            }
        }.start();
    }
    private void pulse(long now) throws Exception {
        double elapsed = (now - entered) / 1_000_000_000.0;
        switch (phase) {
            case 0:
                if (!music.isPlaying() || nativeMusic.getCurrentTime().toMillis() < 180) return;
                if (broken != null) {
                    if (player(broken).getStatus() != MediaPlayer.Status.DISPOSED) return;
                    expect(IllegalStateException.class, broken::play, "async decode failure includes resource");
                    require(!broken.isPlaying(), "async decode failure does not affect other music");
                }
                require(!callbackFailure.isPlaying() && player(callbackFailure).getStatus() == MediaPlayer.Status.DISPOSED,
                        "injected async callback disposes without interrupting other music");
                try { callbackFailure.play(); throw new AssertionError("failed music accepted play"); }
                catch (IllegalStateException expected) {
                    require(expected.getMessage().contains("audio-check.wav"), "async failure includes resource");
                }
                require(!once.isPlaying() && nativeOnce.getCurrentTime().toMillis() < 60, "pause before ready");
                require(!preStopped.isPlaying() && player(preStopped).getCurrentTime().toMillis() < 60, "stop before ready");
                require(sound.isPlaying(), "native sound starts");
                ApiProof.complete("live-music-play",""+music.isPlaying(),"true");
                ApiProof.complete("live-sound-play",""+sound.isPlaying(),"true");
                sound.setMuted(true); require(sound.isMuted() && !sound.isPlaying(), "mute stops active effects");
                sound.play(); require(!sound.isPlaying(), "muted effects do not play");
                sound.setMuted(false); require(!sound.isPlaying(), "unmute does not replay");
                ApiCompletionChecks.musicPause(music); pausedAt = nativeMusic.getCurrentTime().toMillis(); next(now); break;
            case 1:
                if (elapsed < .3) return;
                require(!music.isPlaying() && Math.abs(nativeMusic.getCurrentTime().toMillis() - pausedAt) < 100, "pause holds position");
                if(!soundStopStarted){sound.play();soundStopStarted=true;return;}
                if(!sound.isPlaying())return;
                ApiProof.complete("live-music-pause",""+(!music.isPlaying()&&Math.abs(nativeMusic.getCurrentTime().toMillis()-pausedAt)<100),"true");
                ApiCompletionChecks.soundStop(sound);
                ApiProof.complete("live-sound-stop",""+sound.isPlaying(),"false");
                music.play(); next(now); break;
            case 2:
                if (!music.isPlaying() || nativeMusic.getCurrentTime().toMillis() < pausedAt + 130) return;
                require(true, "resume advances"); ApiCompletionChecks.musicStop(music); next(now); break;
            case 3:
                if (elapsed < .12) return;
                require(!music.isPlaying() && nativeMusic.getCurrentTime().toMillis() < 80, "stop rewinds");
                if(repeats==0)ApiProof.complete("live-music-stop",""+(!music.isPlaying()&&nativeMusic.getCurrentTime().toMillis()<80),"true");
                music.play(); next(now); break;
            case 4:
                if (!music.isPlaying() || nativeMusic.getCurrentTime().toMillis() < 150) return;
                require(nativeMusic.getCurrentTime().toMillis() < 600, "restart begins at start");
                if (++repeats < 3) { music.stop(); phase = 3; entered = now; }
                else { once.play(); next(now); }
                break;
            case 5:
                if (elapsed < 2.5) return;
                require(music.isPlaying() && nativeMusic.getCurrentCount() >= 2, "full native repeats after three restarts");
                ApiProof.complete("live-music-loop",""+(music.isPlaying()&&nativeMusic.getCurrentCount()>=2),"true");
                require(!once.isPlaying() && nativeOnce.getCurrentTime().toMillis() >= 850,
                        "play once reaches end status=" + nativeOnce.getStatus() + " time=" + nativeOnce.getCurrentTime());
                // Seek/status notifications are asynchronous. Observe an actual rewind
                // before checking subsequent playback, rather than the stale end time.
                nativeOnce.currentTimeProperty().addListener((observable, previous, current) -> {
                    if (current.toMillis() < 650) replayRewound = true;
                });
                once.play(); next(now); break;
            case 6:
                if (!replayRewound || !once.isPlaying() || nativeOnce.getCurrentTime().toMillis() < 120) return;
                require(nativeOnce.getCurrentTime().toMillis() < 650, "play after end restarts");
                once.close(); once.close();
                require(!once.isPlaying() && nativeOnce.getStatus() == MediaPlayer.Status.DISPOSED, "music close disposes");
                expect(IllegalStateException.class, once::play, "closed music");
                expect(IllegalStateException.class, () -> once.setMuted(true), "closed music setter");
                ownerStage.close(); // Must clean up without Application.launch owning this App.
                require(sound.isClosed() && !sound.isPlaying() && music.isClosed()
                        && nativeMusic.getStatus() == MediaPlayer.Status.DISPOSED, "window hidden cleans app audio");
                owner.stop(); owner.stop(); // Simulate the launcher's later stop callback.
                require(owner.shutdowns == 1, "window hide and repeated stop invoke shutdown once");
                Sound afterStop = owner.loadSound("audio-check.wav");
                Music songAfterStop = owner.loadMusic("audio-check.wav");
                owner.stop();
                require(owner.shutdowns == 1 && afterStop.isClosed() && songAfterStop.isClosed()
                        && player(songAfterStop).getStatus() == MediaPlayer.Status.DISPOSED,
                        "repeat stop still releases audio loaded after stop");
                verifyFailures(); next(now); break;
            case 7:
                if (frameErrors == 0) return;
                require(frameErrors == 1 && failing.updates == 1, "failed frame timer stops");
                require(failing.sound.isClosed() && failing.music.isClosed()
                        && player(failing.music).getStatus() == MediaPlayer.Status.DISPOSED, "frame failure closes audio");
                failingStage.close(); Thread.currentThread().setUncaughtExceptionHandler(previousHandler);
                ApiNative.emit();
                System.out.println("ZERO_AUDIO_OK " + checks + " native checks: canonical effects, independent/pre-ready music, pause/rewind/repeated loops, mute/volume/errors, ownership and failure cleanup");
                Platform.exit(); phase = 8; break;
        }
    }
    private void verifyFailures() throws Exception {
        Owner startup = new Owner() {
            @Override public void setup() {
                sound = loadSound("/zero/audio-check.wav"); music = loadMusic("/zero/audio-check.wav");
                throw new IllegalStateException("Expected audio setup failure");
            }
            Sound sound; Music music;
        };
        Stage stage = new Stage();
        expect(IllegalStateException.class, () -> startup.start(stage), "startup failure");
        // Inspect the anonymous owner's retained values without extending the public API.
        var soundField = startup.getClass().getDeclaredField("sound"); soundField.setAccessible(true);
        var musicField = startup.getClass().getDeclaredField("music"); musicField.setAccessible(true);
        require(((Sound) soundField.get(startup)).isClosed() && ((Music) musicField.get(startup)).isClosed()
                && !stage.isShowing(), "startup failure cleans audio and window");
        Owner badShutdown = new Owner() {
            @Override protected void shutdown() { super.shutdown(); throw new IllegalStateException("Expected shutdown failure"); }
        };
        Sound effect = badShutdown.loadSound("/zero/audio-check.wav"); Music song = badShutdown.loadMusic("/zero/audio-check.wav");
        expect(IllegalStateException.class, badShutdown::stop, "shutdown failure");
        require(effect.isClosed() && song.isClosed() && player(song).getStatus() == MediaPlayer.Status.DISPOSED, "shutdown exception still releases all audio");
        badShutdown.stop(); badShutdown.stop();
        require(badShutdown.shutdowns == 1, "throwing shutdown hook is not retried by later stops");
        Sound lateEffect = badShutdown.loadSound("/zero/audio-check.wav");
        Music lateSong = badShutdown.loadMusic("/zero/audio-check.wav");
        badShutdown.stop();
        require(lateEffect.isClosed() && lateSong.isClosed() && badShutdown.shutdowns == 1
                && player(lateSong).getStatus() == MediaPlayer.Status.DISPOSED,
                "throwing hook does not prevent later resource cleanup");
        previousHandler = Thread.currentThread().getUncaughtExceptionHandler();
        Thread.currentThread().setUncaughtExceptionHandler((thread, failure) -> {
            if (failure instanceof IllegalStateException && "Expected audio frame failure".equals(failure.getMessage())) frameErrors++;
            else { failure.printStackTrace(); System.exit(1); }
        });
        failing = new FailingGame(); failingStage = new Stage(); failing.start(failingStage);
    }
    private static final class FailingGame extends GameApp {
        Sound sound; Music music; int updates;
        @Override public void setup() { sound = loadSound("/zero/audio-check.wav"); music = loadMusic("/zero/audio-check.wav"); music.loop(); }
        @Override public void update(double seconds) { updates++; throw new IllegalStateException("Expected audio frame failure"); }
    }
    private static MediaPlayer player(Music music) throws Exception {
        var field = Music.class.getDeclaredField("player"); field.setAccessible(true); return (MediaPlayer) field.get(music);
    }
    private void next(long now) { phase++; entered = now; }
    private void require(boolean value, String description) { if (!value) throw new AssertionError(description); checks++; }
    private void expect(Class<? extends Throwable> type, Runnable action, String description) {
        try { action.run(); } catch (Throwable failure) {
            if (!type.isInstance(failure)) throw failure;
            require(failure.getMessage() != null && !failure.getMessage().isBlank(), description + " useful error"); return;
        }
        throw new AssertionError(description + " accepted");
    }
    public static void main(String[] args) { launch(args); }
}
