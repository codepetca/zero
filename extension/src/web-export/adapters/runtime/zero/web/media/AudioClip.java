package zero.web.media;

/** One cached element per effect; a new effect press restarts that short sound. */
public final class AudioClip {
    private final BrowserSound sound;
    public AudioClip(String source) { sound = new BrowserSound(source, () -> { }); }
    public void setVolume(double volume) { sound.audio.volume = Math.max(0, Math.min(1, volume)); }
    public void play() { sound.audio.currentTime = 0; sound.play(); }
    public void stop() { sound.stop(); }
}
