import zero.Color;
import zero.GameApp;
import zero.ui.Button;

public class Main extends GameApp {
    private boolean playing = false;
    private Button navigation;

    @Override public void settings() {
        title("Moonlight Mission");
        size(640, 360);
    }

    @Override public void setup() {
        navigation = new Button("Start");
        navigation.onClick(this::switchScreen);
        controls(navigation);
    }

    private void switchScreen() {
        playing = !playing;
        navigation.setText(playing ? "Back" : "Start");
    }

    @Override public void draw() {
        if (playing) {
            drawGame();
        } else {
            drawTitle();
        }
    }

    private void drawTitle() {
        background(Color.rgb(19, 24, 55));
        fill(Color.rgb(56, 66, 115));
        circle(535, 80, 110);
        fill(Color.rgb(255, 224, 145));
        circle(520, 70, 70);
        fill(Color.rgb(124, 151, 207));
        circle(90, 65, 5);
        circle(170, 120, 7);
        circle(390, 45, 5);
        circle(570, 180, 7);
        fill(Color.WHITE);
        textSize(38);
        text("MOONLIGHT MISSION", 55, 205);
        fill(Color.rgb(189, 210, 247));
        textSize(18);
        text("A small adventure by your name", 57, 242);
        text("Press Start to explore", 57, 276);
    }

    private void drawGame() {
        background(Color.rgb(27, 55, 74));
        fill(Color.rgb(68, 122, 112));
        rect(0, 260, 640, 100);
        fill(Color.rgb(255, 224, 145));
        circle(500, 75, 65);
        fill(Color.WHITE);
        textSize(24);
        text("Your adventure begins here!", 35, 55);
        textSize(16);
        text("Move your pointer across the scene.", 35, 85);
        fill(Color.rgb(241, 164, 116));
        circle(mouseX(), mouseY(), 32);
    }

    public static void main(String[] args) { launch(args); }
}
