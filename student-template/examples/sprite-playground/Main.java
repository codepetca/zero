import javafx.scene.image.Image;
import javafx.scene.input.KeyCode;
import javafx.scene.input.MouseButton;
import javafx.scene.paint.Color;
import zero.Collisions;
import zero.ImageRegion;
import zero.GameApp;
import zero.SpriteAnimation;

/** Two birds share one loaded image, but have independent animation clocks. */
public class Main extends GameApp {
    SpriteAnimation bird, companion;
    double x = 140, y = 220;
    boolean paused;

    @Override public void settings() { title("Sprite playground"); size(640, 420); }
    @Override public void setup() {
        Image sheet = loadImage("/bird-flap-sheet.png");
        // This generated atlas needs an alignment correction in its lower row.
        // A regular grid instead needs only loadAnimation(path, columns, rows, fps).
        ImageRegion[] frames = {
            imageRegion(sheet, 0, 0, 701, 561), imageRegion(sheet, 701, 0, 701, 561),
            imageRegion(sheet, 0, 531, 701, 561), imageRegion(sheet, 701, 531, 701, 561)
        };
        bird = new SpriteAnimation(12, frames);
        companion = new SpriteAnimation(6, frames);
    }
    @Override public void update(double seconds) {
        if (!windowFocused()) paused = true;
        if (keyPressed(KeyCode.R)) {
            x = 140; y = 220; bird.reset(); companion.reset(); paused = false;
        } else if (keyPressed(KeyCode.SPACE) || mousePressed(MouseButton.PRIMARY)) paused = !paused;
        if (paused) return;
        if (keyDown(KeyCode.LEFT)) x -= 180 * seconds;
        if (keyDown(KeyCode.RIGHT)) x += 180 * seconds;
        if (keyDown(KeyCode.UP)) y -= 180 * seconds;
        if (keyDown(KeyCode.DOWN)) y += 180 * seconds;
        x = Math.max(45, Math.min(width() - 45, x));
        y = Math.max(120, Math.min(height() - 36, y));
        bird.update(seconds);
        companion.update(seconds);
    }
    @Override public void draw() {
        background(Color.web("#e7f1ed"));
        fill(Color.web("#153f48")); textSize(28);
        textCentered("Sprite playground", width() / 2, 45);
        textSize(15); textCentered("Arrows move • Space/click pauses • R resets", width() / 2, 75);
        boolean touching = Collisions.circleHitsRect(x, y, 15, 300, 150, 70, 160);
        fill(touching ? Color.web("#f1bd52") : Color.web("#769b89"));
        rect(300, 150, 70, 160);
        imageCentered(bird, x, y, 90, 72, 0);
        // Same pixels, half-speed clock, drawn upside down without changing the next drawing.
        imageFlippedY(companion, 490, 200, 90, 72);
        fill(Color.web("#153f48")); textSize(15);
        textCentered(paused ? "Paused" : "Touch the rectangle", width() / 2, 395);
    }
    public static void main(String[] args) { launch(args); }
}
