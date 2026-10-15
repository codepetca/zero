package zero.web.media;
import java.util.ArrayList;

/** A shared effect owns independent active voices, matching successive native play calls. */
public final class AudioClip {
    private static final int MAX_VOICES = 32;
    private final String source;
    private final ArrayList<BrowserSound> voices = new ArrayList<>();
    private BrowserSound probe;
    private MediaException error;
    private double volume = 1;
    public AudioClip(String source) {
        this.source = source;
        probe = new BrowserSound(source, () -> { error = new MediaException("Cannot load sound: " + source); });
        probe.audio.addEventListener("canplay", event -> { if (probe != null) { probe.dispose(); probe = null; } });
    }
    public void setVolume(double volume) { this.volume = Math.max(0, Math.min(1, volume)); }
    public double getVolume() { return volume; }
    public void play() { play(volume); }
    public void play(double volume) {
        if (error != null) throw error;
        prune();
        // A gesture retries one pending effect, not an accumulating history of frames.
        for (BrowserSound pending : voices) if (pending.isBlocked()) {
            pending.audio.volume = Math.max(0, Math.min(1, volume)); return;
        }
        if (voices.size() >= MAX_VOICES) {
            for (BrowserSound pending : voices) if (pending.isPending()) return;
            voices.remove(0).dispose(); // Bound active polyphony as well as native element ownership.
        }
        BrowserSound voice = new BrowserSound(source, () -> { error = new MediaException("Cannot play sound: " + source); prune(); });
        voice.audio.volume = Math.max(0, Math.min(1, volume));
        voices.add(voice);
        voice.audio.addEventListener("ended", event -> { voice.dispose(); voices.remove(voice); });
        voice.audio.addEventListener("error", event -> { voice.dispose(); voices.remove(voice); });
        voice.onBlocked = () -> {
            for (BrowserSound other : new ArrayList<>(voices)) if (other != voice && other.isPending()) { other.dispose(); voices.remove(other); }
        };
        voice.play();
    }
    private void prune() { voices.removeIf(voice -> voice.isDisposed()); }
    public boolean isPlaying() { for (BrowserSound voice : voices) if (voice.isPlaying()) return true; return false; }
    public void stop() {
        for (BrowserSound voice : new ArrayList<>(voices)) voice.dispose();
        voices.clear();
        if (probe != null) { probe.dispose(); probe = null; }
    }
}
