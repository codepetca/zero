import zero.AnimationPlayback;
import zero.AnimationSource;
import zero.ImageRegion;

/** Share immutable frame definitions; each actor receives its own one-shot clock. */
public final class OnceAnimation implements AnimationSource {
    private final ImageRegion[] frames;
    private final double fps;

    public OnceAnimation(double fps, ImageRegion... frames) {
        if (!Double.isFinite(fps) || fps <= 0) throw new IllegalArgumentException("Once animation fps must be positive and finite.");
        if (frames == null || frames.length < 2) throw new IllegalArgumentException("Once animation needs at least two frames.");
        this.frames = new ImageRegion[frames.length];
        for (int i = 0; i < frames.length; i++) {
            if (frames[i] == null) throw new IllegalArgumentException("Once animation frames must not be null.");
            this.frames[i] = frames[i];
        }
        this.fps = fps;
    }

    @Override public AnimationPlayback createPlayback() { return new Playback(); }

    private final class Playback implements AnimationPlayback {
        private double position;

        @Override public void update(double seconds) {
            if (!Double.isFinite(seconds) || seconds < 0) throw new IllegalArgumentException("Once animation seconds must be non-negative and finite.");
            if (seconds == 0) return;
            double last = frames.length - 1;
            // Compare time before multiplying so even a huge finite delta clamps
            // safely instead of overflowing the frame position.
            if (seconds >= (last - position) / fps) position = last;
            else position += seconds * fps;
        }

        @Override public ImageRegion frame() { return frames[(int) position]; }
    }
}
