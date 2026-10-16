package zero.web;
import java.util.HashMap;
import java.util.Map;
import javafx.scene.image.Image;

public final class BrowserImages {
    private static final Map<String, Image> images = new HashMap<>();
    static void put(String path, Image image) { images.put(path, image); }
    public static Image get(String path, Class<?> owner) {
        Image image = images.get(Resources.key(owner, path));
        if (image == null) throw new IllegalArgumentException("Image resource not found or not preloaded: " + path);
        return image;
    }
}
