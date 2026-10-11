/** World coordinates remain unchanged; only drawing moves. */
public class Camera {
    private double x;
    private double y;

    public void follow(double centreX, double centreY, double viewportWidth,
                       double viewportHeight, double worldWidth, double worldHeight) {
        x = Math.max(0, Math.min(centreX - viewportWidth / 2,
                Math.max(0, worldWidth - viewportWidth)));
        y = Math.max(0, Math.min(centreY - viewportHeight / 2,
                Math.max(0, worldHeight - viewportHeight)));
    }

    public double x() { return x; }
    public double y() { return y; }
}
