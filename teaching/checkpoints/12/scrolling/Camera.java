public class Camera {
    private double x;

    public double x() { return x; }

    public void follow(double playerX, double viewportWidth, double worldWidth) {
        x = Math.max(0, Math.min(playerX - viewportWidth / 2,
                worldWidth - viewportWidth));
    }
}
