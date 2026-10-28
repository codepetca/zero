import zero.Color;
import zero.GameApp;
import zero.ImageRegion;
import zero.Key;
import zero.Sound;
import zero.SpriteAnimation;

public class Main extends GameApp {
    private SpriteAnimation petAnimation;
    private Sound chime;
    private double x = 280;

    @Override public void settings() { size(640, 400); }
    @Override public void setup() {
        var sheet = loadImageRegion("/pet/bird-flap-sheet.png");
        ImageRegion[] frames = {
            imageRegion(sheet.image(), 0, 0, 701, 561),
            imageRegion(sheet.image(), 701, 0, 701, 561),
            imageRegion(sheet.image(), 0, 531, 701, 561),
            imageRegion(sheet.image(), 701, 531, 701, 561)
        };
        petAnimation = new SpriteAnimation(8, frames);
        chime = loadSound("/pet/chime.wav");
        chime.setVolume(0.25);
    }

    @Override public void update(double seconds) {
        if (keyDown(Key.LEFT)) x -= 160 * seconds;
        if (keyDown(Key.RIGHT)) x += 160 * seconds;
        x = Math.max(0, Math.min(x, width() - 80));
        petAnimation.update(seconds);
        if (keyPressed(Key.SPACE)) {
            chime.stop();
            chime.play();
        }
    }

    @Override public void draw() {
        background(Color.rgb(240, 248, 255));
        fill(Color.rgb(47, 79, 79));
        textSize(20);
        text("Click the canvas; arrows move, Space chimes.", 20, 30);
        image(petAnimation, x, 150, 80, 64);
    }

    public static void main(String[] args) { launch(args); }
}
