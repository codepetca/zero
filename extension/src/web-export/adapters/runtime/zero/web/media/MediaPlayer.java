package zero.web.media;
import javafx.util.Duration;
import javafx.application.Platform;

/** Browser lifecycle used by the unchanged zero.Music implementation. */
public final class MediaPlayer {
    public static final int INDEFINITE = -1;
    public enum Status { UNKNOWN, READY, PAUSED, PLAYING, STOPPED, STALLED, HALTED, DISPOSED }
    private final Media media;
    private final BrowserSound sound;
    private Runnable onError, onReady, onEnd;
    private boolean ready, readyDelivered, disposed, stopped, commanded;
    private MediaException error;
    private int cycleCount = 1;
    public MediaPlayer(Media media) {
        this.media = media;
        sound = new BrowserSound(media.getSource(), this::failed);
        sound.audio.addEventListener("canplay", event -> ready());
        sound.audio.addEventListener("loadeddata", event -> ready());
        sound.audio.addEventListener("ended", event -> { if (!disposed && onEnd != null) onEnd.run(); });
        if (sound.audio.readyState >= 2) Platform.runLater(this::ready);
    }
    private void ready() {
        if (disposed || error != null) return;
        ready = true;
        if (!readyDelivered && onReady != null) { readyDelivered = true; onReady.run(); }
    }
    private void failed() {
        if (disposed || error != null) return;
        error = new MediaException("Cannot play music: " + media.getSource());
        media.failed(error);
        if (onError != null) onError.run();
    }
    public Media getMedia() { return media; }
    public MediaException getError() { return error; }
    public void setOnError(Runnable handler) { onError = handler; }
    public Runnable getOnError() { return onError; }
    public void setOnReady(Runnable handler) { onReady = handler; if (ready) Platform.runLater(this::ready); }
    public Runnable getOnReady() { return onReady; }
    public void setOnEndOfMedia(Runnable handler) { onEnd = handler; }
    public Runnable getOnEndOfMedia() { return onEnd; }
    public void setVolume(double volume) { sound.audio.volume = Math.max(0, Math.min(1, volume)); }
    public double getVolume() { return sound.audio.volume; }
    public void setMute(boolean muted) { sound.audio.muted = muted; }
    public boolean isMute() { return sound.audio.muted; }
    public void setCycleCount(int count) {
        if (count != 1 && count != INDEFINITE) throw new MediaException("Browser music supports cycle count 1 or INDEFINITE.");
        cycleCount = count; sound.audio.loop = count == INDEFINITE;
    }
    public int getCycleCount() { return cycleCount; }
    public Status getStatus() {
        if (disposed) return Status.DISPOSED;
        if (error != null) return Status.HALTED;
        if (!ready) return Status.UNKNOWN;
        if (sound.isPlaying()) return Status.PLAYING;
        return !commanded ? Status.READY : stopped ? Status.STOPPED : Status.PAUSED;
    }
    public Duration getCurrentTime() { return Duration.seconds(sound.audio.currentTime); }
    public void play() { if (!disposed) { commanded = true; stopped = false; sound.play(); } }
    public void pause() { if (!disposed) { commanded = true; stopped = false; sound.pause(); } }
    public void stop() { if (!disposed) { commanded = true; stopped = true; sound.stop(); } }
    public void seek(Duration position) { if (!disposed) sound.audio.currentTime = position.toSeconds(); }
    public void dispose() { if (disposed) return; disposed = true; sound.dispose(); }
}
