import zero.GameApp;
import zero.SpriteAnimation;

// One pet owns its position and animation clock.
public class Pet {
    private final SpriteAnimation animation;
    private double x = 280;

    public Pet(SpriteAnimation animation) { this.animation = animation; }

    public void update(int direction, double seconds, double canvasWidth) {
        x += direction * 160 * seconds;
        x = Math.max(0, Math.min(x, canvasWidth - 80));
        animation.update(seconds);
    }

    public void draw(GameApp game) {
        game.image(animation, x, 150, 80, 64);
    }
}
