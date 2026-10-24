package zero;

/** Canvas colors without requiring a JavaFX import in ordinary student code. */
public final class Color {
    public static final Color WHITE = new Color(javafx.scene.paint.Color.WHITE);
    public static final Color BLACK = new Color(javafx.scene.paint.Color.BLACK);
    public static final Color BLUE = new Color(javafx.scene.paint.Color.BLUE);
    public static final Color GOLD = new Color(javafx.scene.paint.Color.GOLD);

    private final javafx.scene.paint.Color color;

    private Color(javafx.scene.paint.Color color) { this.color = color; }

    public static Color rgb(int red, int green, int blue) {
        return new Color(javafx.scene.paint.Color.rgb(red, green, blue));
    }

    javafx.scene.paint.Color fxColor() { return color; }
}
