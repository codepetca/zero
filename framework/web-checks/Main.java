import javafx.scene.image.Image;
import javafx.scene.input.KeyCode;
import javafx.scene.input.MouseButton;
import javafx.scene.paint.Color;
import zero.Collisions;
import zero.ImageRegion;
import zero.GameApp;
import zero.SpriteAnimation;

/** Release check: exercise the supported canvas API through the real exporter. */
public final class Main extends GameApp {
    private Image sheet;
    private ImageRegion region;
    private SpriteAnimation animation, sequence;
    private int presses, clicks, initCalls;
    private double x = 150;
    private boolean paused;
    @Override public void init() {
        if (++initCalls != 1) throw new IllegalStateException("Application.init must run exactly once");
    }
    @Override public void settings() { title("Zero web helpers"); size(480, 400); padding(0); }
    @Override public void setup() {
        if (initCalls != 1) throw new IllegalStateException("Application.init must run before setup");
        sheet = loadImage("/tiles.png");
        if (sheet != loadImage("/./tiles.png")) throw new IllegalStateException("Image aliases lost cache identity");
        region = imageRegion(sheet, 0, 0, 12, 12);
        animation = loadAnimation("/tiles.png", 2, 2, 12);
        sequence = new SpriteAnimation(8, region, imageRegion(sheet, 12, 0, 12, 12));
        if (region.image() != sheet || region.x() != 0 || region.y() != 0 || region.width() != 12 || region.height() != 12
                || animation.frameCount() != 4 || animation.columns() != 2 || animation.rows() != 2
                || animation.fps() != 12 || animation.image() != sheet || animation.frame().width() != 12
                || sequence.frameIndex() != 0) throw new IllegalStateException("Sprite API check failed");
        if (!Collisions.circleHitsRect(5, 5, 3, 6, 6, 4, 4)
                || !Collisions.rectHitsRect(0, 0, 4, 4, 4, 4, 2, 2)
                || !Collisions.circleHitsCircle(0, 0, 2, 3, 0, 2)) throw new IllegalStateException("Collision API check failed");
        if (canvas() == null || graphics() == null || layout() == null) throw new IllegalStateException("JavaFX escape hatches missing");
        canvas().setAccessibleText("Zero web helper check");
        sequence.reset();
    }
    @Override public void update(double seconds) {
        if (!windowFocused()) paused = true;
        if (keyPressed(KeyCode.P)) paused = !paused;
        if (keyPressed(KeyCode.SPACE)) presses++;
        if (mousePressed(MouseButton.PRIMARY)) clicks++;
        if (!paused) {
            animation.update(seconds); sequence.update(seconds);
            if (keyDown(KeyCode.RIGHT)) x += 100 * seconds;
        }
    }
    @Override public void draw() {
        background(Color.WHITE); fill(Color.BLACK); textSize(20);
        text("Web helpers ready", 15, 30);
        text("Presses: " + presses, 15, 58);
        text("Clicks: " + clicks, 15, 86);
        text("Position: " + (int) x, 15, 114);
        text(paused ? "Paused" : "Playing", 15, 142);
        textCentered("Centered", width() / 2, height() - 20);
        fill(Color.BLUE); rect(20, 170, 20, 20); circle(70, 180, 20);
        stroke(Color.BLACK); strokeWidth(2); outlineRect(90, 170, 20, 20); line(120, 170, 140, 190);
        image(sheet, 20, 220); image(sheet, 60, 220, 30, 30);
        image(region, 110, 220); image(region, 140, 220, 30, 30);
        image(animation, 190, 220); image(animation, 220, 220, 30, 30);
        imageCentered(sheet, 280, 235, 30, 30, 20);
        imageCentered(region, 320, 235, 30, 30, -20);
        imageCentered(sequence, 360, 235, 30, 30, 30);
        imageFlippedY(sheet, 40, 290, 40, 40);
        imageFlippedY(region, 110, 290, 40, 40);
        imageFlippedY(animation, 180, 290, 40, 40);
        if (mouseDown(MouseButton.PRIMARY)) circle(mouseX(), mouseY(), 6);
    }
    public static void main(String[] args) { launch(args); }
}
