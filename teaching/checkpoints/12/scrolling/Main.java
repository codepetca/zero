import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.image.Image;
import javafx.scene.input.KeyCode;
import javafx.scene.layout.HBox;
import javafx.scene.media.AudioClip;
import javafx.scene.media.MediaException;
import javafx.scene.paint.Color;
import zero.GameApp;

public class Main extends GameApp {
    private final double worldWidth = 1600;
    private Player player;
    private Camera camera;
    private Coin[] coins;
    private int points;
    private boolean won;
    private ScoreDisplay score;
    private Label message;
    private Label soundStatus;
    private Image sprite;
    private AudioClip chime;
    private int plays;

    @Override public void settings() {
        size(640, 400);
    }

    @Override public void setup() {
        var imageFile = getClass().getResource("/media-demo/player.png");
        if (imageFile != null) sprite = loadImage("/media-demo/player.png");
        var soundFile = getClass().getResource("/media-demo/chime.wav");
        if (soundFile != null) {
            try {
                chime = new AudioClip(soundFile.toExternalForm());
                chime.setVolume(0.25);
            } catch (MediaException failure) {
                throw new IllegalArgumentException("Cannot load sound: /media-demo/chime.wav", failure);
            }
        }
        score = new ScoreDisplay();
        score.setColor(Color.DARKSLATEBLUE);
        message = new Label();
        soundStatus = new Label();
        var restartButton = new Button("Restart");
        restartButton.setOnAction(event -> restart());
        var controls = new HBox(12, score.view(), soundStatus, message, restartButton);
        controls.setPadding(new Insets(12));
        layout().setBottom(controls);
        restart();
    }

    public void restart() {
        player = new Player(40, 180);
        camera = new Camera();
        coins = new Coin[] {
            new Coin(220, 180), new Coin(840, 80), new Coin(1360, 300)
        };
        points = 0;
        won = false;
        score.setScore(points);
        plays = 0;
        soundStatus.setText("Chimes: 0");
        message.setText("Collect all " + coins.length + " coins.");
        canvas().requestFocus();
    }

    @Override public void update(double seconds) {
        if (won) return;
        int horizontal = 0;
        int vertical = 0;
        if (keyDown(KeyCode.LEFT)) horizontal--;
        if (keyDown(KeyCode.RIGHT)) horizontal++;
        if (keyDown(KeyCode.UP)) vertical--;
        if (keyDown(KeyCode.DOWN)) vertical++;
        player.update(horizontal, vertical, seconds, worldWidth, height());
        camera.follow(player.x(), width(), worldWidth);

        for (Coin each : coins) {
            if (!each.isCollected() && each.touches(player)) {
                each.collect();
                points++;
                score.setScore(points);
                if (chime != null) {
                    chime.stop();
                    chime.play();
                    plays++;
                    soundStatus.setText("Chimes: " + plays);
                }
            }
        }
        if (points == coins.length) {
            won = true;
            message.setText("You win! Choose Restart.");
        }
    }

    @Override public void draw() {
        background(Color.ALICEBLUE);
        fill(Color.DARKSLATEGRAY);
        textSize(20);
        text("Click the canvas, then hold the arrow keys.", 20, 30);
        for (Coin each : coins) each.draw(this, camera.x());
        if (sprite == null) player.draw(this, camera.x());
        else player.drawImage(this, sprite, camera.x());
    }

    public static void main(String[] args) { launch(args); }
}
