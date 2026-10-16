package zero;

import java.util.Objects;
import javafx.scene.image.Image;

/** An immutable rectangle in an existing image; no pixels are copied. */
public final class ImageRegion {
    private final Image image;
    private final double x, y, width, height;

    public ImageRegion(Image image, double x, double y, double width, double height) {
        this.image = Objects.requireNonNull(image, "Image must not be null.");
        requireLoaded(image);
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(width)
                || !Double.isFinite(height) || x < 0 || y < 0 || width <= 0 || height <= 0
                || width > image.getWidth() - x || height > image.getHeight() - y) {
            throw new IllegalArgumentException("Image region must have finite, positive dimensions and lie inside the image.");
        }
        this.x = x; this.y = y; this.width = width; this.height = height;
    }

    static void requireLoaded(Image image) {
        if (image.isError() || image.getProgress() < 1 || !Double.isFinite(image.getWidth())
                || !Double.isFinite(image.getHeight()) || image.getWidth() <= 0 || image.getHeight() <= 0) {
            throw new IllegalArgumentException("Image must be successfully loaded with positive dimensions.", image.getException());
        }
    }

    public Image image() { return image; }
    public double x() { return x; }
    public double y() { return y; }
    public double width() { return width; }
    public double height() { return height; }
}
