import zero.Color;
import zero.GameApp;
import zero.ImageRegion;

public class Main extends GameApp {
    private ImageRegion petImage;

    @Override public void settings() { size(640, 400); }
    @Override public void setup() {
        var sheet = loadImageRegion("/pet/bird-flap-sheet.png");
        petImage = imageRegion(sheet.image(), 0, 0, 701, 561);
    }

    @Override public void draw() {
        background(Color.rgb(240, 248, 255));
        image(petImage, 280, 150, 80, 64);
    }

    public static void main(String[] args) { launch(args); }
}
