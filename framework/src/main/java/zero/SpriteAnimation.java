package zero;

import java.util.Objects;
import javafx.scene.image.Image;

/** A looping row-major sprite sheet. Each object owns its own explicit update timer. */
public final class SpriteAnimation implements AnimationSource {
    private final Image image;
    private final int columns, rows;
    private final double fps;
    private final ImageRegion[] frames;
    private double position;

    public SpriteAnimation(Image image, int columns, int rows, double fps) {
        this.image = Objects.requireNonNull(image, "Image must not be null.");
        ImageRegion.requireLoaded(image);
        if (columns <= 0 || rows <= 0 || (long) columns * rows > Integer.MAX_VALUE
                || image.getWidth() % columns != 0 || image.getHeight() % rows != 0) {
            throw new IllegalArgumentException("Sprite columns and rows must be positive and divide the image dimensions exactly.");
        }
        if (!Double.isFinite(fps) || fps <= 0) {
            throw new IllegalArgumentException("Animation fps must be a positive finite number.");
        }
        this.columns = columns; this.rows = rows; this.fps = fps;
        frames = new ImageRegion[columns * rows];
        double width = image.getWidth() / columns, height = image.getHeight() / rows;
        for (int i = 0; i < frames.length; i++) {
            frames[i] = new ImageRegion(image, (i % columns) * width, (i / columns) * height, width, height);
        }
    }

    /** An explicit frame sequence for irregular atlases; columns is the sequence length and rows is one. */
    public SpriteAnimation(double fps, ImageRegion... frames) {
        Objects.requireNonNull(frames, "Animation frames must not be null.");
        if (frames.length == 0) throw new IllegalArgumentException("Animation needs at least one frame.");
        if (!Double.isFinite(fps) || fps <= 0) throw new IllegalArgumentException("Animation fps must be a positive finite number.");
        ImageRegion first = Objects.requireNonNull(frames[0], "Animation frame must not be null.");
        this.image = first.image(); this.columns = frames.length; this.rows = 1; this.fps = fps;
        this.frames = frames.clone();
        for (ImageRegion frame : this.frames) {
            Objects.requireNonNull(frame, "Animation frame must not be null.");
            if (frame.image() != image || frame.width() != first.width() || frame.height() != first.height()) {
                throw new IllegalArgumentException("Animation frames must share one image and equal dimensions.");
            }
        }
    }

    /** Each owner gets a fresh looping clock at frame zero, sharing only frame definitions. */
    @Override public AnimationPlayback createPlayback() { return new Playback(); }

    private final class Playback implements AnimationPlayback {
        private double position;
        @Override public void update(double seconds) { position = advance(position, seconds); }
        @Override public ImageRegion frame() { return frames[(int) position]; }
    }

    public void update(double seconds) { position = advance(position, seconds); }

    private double advance(double position, double seconds) {
        if (!Double.isFinite(seconds) || seconds < 0) {
            throw new IllegalArgumentException("Animation seconds must be a non-negative finite number.");
        }
        // Reduce time before multiplying: a finite delta times fps can overflow.
        double cycle = frames.length / fps;
        double advance = (seconds % cycle) * fps;
        return (position + advance) % frames.length;
    }
    public void reset() { position = 0; }
    public ImageRegion frame() { return frames[frameIndex()]; }
    public int frameIndex() { return (int) position; }
    public int frameCount() { return frames.length; }
    public int columns() { return columns; }
    public int rows() { return rows; }
    public double fps() { return fps; }
    public Image image() { return image; }
}
