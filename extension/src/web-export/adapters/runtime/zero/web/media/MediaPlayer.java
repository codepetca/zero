package zero.web.media;
import javafx.util.Duration;

/** Supported browser subset: play/pause/seek, volume/mute, indefinite music, dispose/errors. */
public final class MediaPlayer {
    public static final int INDEFINITE = -1;
    private final Media media;
    private final BrowserSound sound;
    private Runnable onError;
    public MediaPlayer(Media media) {
        this.media = media;
        sound = new BrowserSound(media.getSource(), () -> { media.failed(); if (onError != null) onError.run(); });
    }
    public Media getMedia() { return media; }
    public void setOnError(Runnable handler) { onError = handler; }
    public void setVolume(double volume) { sound.audio.volume = Math.max(0, Math.min(1, volume)); }
    public void setMute(boolean muted) { sound.audio.muted = muted; }
    public void setCycleCount(int count) {
        if (count != 1 && count != INDEFINITE) throw new MediaException("Browser music supports cycle count 1 or INDEFINITE.");
        sound.audio.loop = count == INDEFINITE;
    }
    public void play() { sound.play(); }
    public void pause() { sound.pause(); }
    public void stop() { sound.stop(); }
    public void seek(Duration position) { sound.audio.currentTime = position.toSeconds(); }
    public void dispose() { sound.dispose(); }
}
