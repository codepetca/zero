import zero.Color;
import zero.GameApp;
import zero.ImageRegion;
import zero.Key;
import zero.Sound;
import zero.SpriteAnimation;

public class Main extends GameApp {
    private Pet pet;
    private Sound chime;

    @Override public void settings() { size(640, 400); }
    @Override public void setup() {
        var sheet = loadImageRegion("/pet/bird-flap-sheet.png");
        ImageRegion[] frames = {
            imageRegion(sheet.image(), 0, 0, 701, 561),
            imageRegion(sheet.image(), 701, 0, 701, 561),
            imageRegion(sheet.image(), 0, 531, 701, 561),
            imageRegion(sheet.image(), 701, 531, 701, 561)
        };
        pet = new Pet(new SpriteAnimation(8, frames));
        chime = loadSound("/pet/chime.wav");
        chime.setVolume(0.25);
    }

    @Override public void update(double seconds) {
        int direction = 0;
        if (keyDown(Key.LEFT)) direction--;
        if (keyDown(Key.RIGHT)) direction++;
        pet.update(direction, seconds, width());
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
        pet.draw(this);
    }

    public static void main(String[] args) { launch(args); }
}
