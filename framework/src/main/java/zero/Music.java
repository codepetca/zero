package zero;

import javafx.scene.media.Media;
import javafx.scene.media.MediaPlayer;
import javafx.util.Duration;

/** Independent music playback. Obtain it with SimpleApp.loadMusic on the JavaFX thread. */
public final class Music implements AutoCloseable {
    private final MediaPlayer player;
    private final String resourcePath;
    private boolean closed;
    private boolean ready;
    private boolean requestedPlaying;
    private boolean rewind;
    private boolean looping;
    private boolean ended;
    private RuntimeException failure;
    private double volume = 1;
    private boolean muted;

    Music(String source, String resourcePath) {
        this.resourcePath = resourcePath;
        try { player = new MediaPlayer(new Media(source)); }
        catch (RuntimeException error) {
            throw new IllegalArgumentException("Cannot load music: " + resourcePath, error);
        }
        player.setOnError(() -> audioFailed(player.getError()));
        player.getMedia().setOnError(() -> audioFailed(player.getMedia().getError()));
        player.setOnReady(() -> {
            if (closed || failure != null) return;
            ready = true;
            applyPlayback();
        });
        player.setOnEndOfMedia(() -> {
            if (!looping) { ended = true; requestedPlaying = false; player.pause(); }
        });
        if (player.getError() != null) audioFailed(player.getError());
        else if (player.getMedia().getError() != null) audioFailed(player.getMedia().getError());
    }

    /** Starts once or resumes paused music. After the end it starts again. Keeps the selected loop mode. */
    public void play() {
        requireOpen();
        if (ended) { rewind = true; ended = false; }
        requestedPlaying = true;
        applyPlayback();
    }
    /** Enables repeating and starts or resumes. The loop mode persists through stop and play. */
    public void loop() {
        requireOpen(); looping = true;
        player.setCycleCount(MediaPlayer.INDEFINITE);
        play();
    }
    public void pause() { requireOpen(); requestedPlaying = false; if (ready) player.pause(); }
    /** Pauses and rewinds, retaining loop mode. The next play starts at the beginning. */
    public void stop() {
        requireOpen(); requestedPlaying = false; rewind = true; ended = false;
        applyPlayback();
    }
    public void setVolume(double volume) {
        requireOpen(); Sound.requireVolume(volume); this.volume = volume; player.setVolume(volume);
    }
    public double getVolume() { return volume; }
    public void setMuted(boolean muted) { requireOpen(); this.muted = muted; player.setMute(muted); }
    public boolean isMuted() { return muted; }
    /** Actual native playback status; may remain false while the media is preparing. */
    public boolean isPlaying() { return !closed && failure == null && !ended && player.getStatus() == MediaPlayer.Status.PLAYING; }
    /** Idempotently disposes native playback. Later controls throw; getters remain readable. */
    @Override public void close() {
        Sound.requireThread();
        if (closed) return;
        closed = true; requestedPlaying = false;
        player.dispose();
    }
    boolean isClosed() { return closed; }
    private void applyPlayback() {
        if (!ready) return;
        if (rewind) {
            // pause/seek also works after repeated restarts on native JavaFX media backends.
            player.pause(); player.seek(Duration.ZERO); rewind = false;
        }
        if (requestedPlaying) player.play(); else player.pause();
    }
    private void requireOpen() {
        Sound.requireThread();
        if (closed) throw new IllegalStateException("Music is closed: " + resourcePath);
        if (failure != null) throw new IllegalStateException("Music is unavailable: " + resourcePath, failure);
    }
    private void audioFailed(RuntimeException error) {
        if (closed || failure != null) return;
        failure = error != null ? error : new IllegalStateException("Unknown native media error");
        requestedPlaying = false;
        System.err.println("Cannot play music: " + resourcePath + " (" + failure.getMessage() + ")");
        player.dispose();
    }
}
