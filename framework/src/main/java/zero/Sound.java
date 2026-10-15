package zero;

import javafx.application.Platform;
import javafx.scene.media.AudioClip;

/** A cached short sound effect. Obtain it with SimpleApp.loadSound on the JavaFX thread. */
public final class Sound implements AutoCloseable {
    private AudioClip clip;
    private final String resourcePath;
    private double volume = 1;
    private boolean muted;
    private boolean closed;

    Sound(String source, String resourcePath) {
        this.resourcePath = resourcePath;
        try { clip = new AudioClip(source); }
        catch (RuntimeException failure) {
            throw new IllegalArgumentException("Cannot load sound: " + resourcePath, failure);
        }
    }

    /** Plays once; successive calls may overlap. Muted calls are silent. */
    public void play() { requireOpen(); if (!muted) clip.play(volume); }
    public void stop() { requireOpen(); clip.stop(); }
    /** Volume for subsequent plays, from 0 (silent) to 1 (full volume). */
    public void setVolume(double volume) { requireOpen(); requireVolume(volume); this.volume = volume; clip.setVolume(volume); }
    public double getVolume() { return volume; }
    /** Muting also stops any effects already playing. Unmuting does not replay them. */
    public void setMuted(boolean muted) { requireOpen(); this.muted = muted; if (muted) clip.stop(); }
    public boolean isMuted() { return muted; }
    public boolean isPlaying() { return !closed && clip.isPlaying(); }
    /** Idempotently stops playback. Later controls throw; getters remain readable. */
    @Override public void close() {
        requireThread();
        if (closed) return;
        closed = true;
        AudioClip released = clip;
        clip = null;
        released.stop();
    }
    boolean isClosed() { return closed; }
    private void requireOpen() {
        requireThread();
        if (closed) throw new IllegalStateException("Sound is closed: " + resourcePath);
    }
    static void requireVolume(double volume) {
        if (!Double.isFinite(volume) || volume < 0 || volume > 1) {
            throw new IllegalArgumentException("Audio volume must be a finite number from 0 to 1.");
        }
    }
    static void requireThread() {
        if (!Platform.isFxApplicationThread()) {
            throw new IllegalStateException("Use audio inside setup(), update(), or a JavaFX event handler.");
        }
    }
}
