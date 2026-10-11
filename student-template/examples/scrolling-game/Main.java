import javafx.geometry.Insets;
import javafx.scene.control.Label;
import javafx.scene.image.Image;
import javafx.scene.input.KeyCode;
import javafx.scene.layout.HBox;
import javafx.scene.media.AudioClip;
import javafx.scene.media.MediaException;
import javafx.scene.paint.Color;
import zero.SketchApp;

/** Main owns input, rules and drawing; ordinary objects do only what it calls. */
public class Main extends SketchApp {
    private Image sprite;
    private AudioClip sound;
    private Player player;
    private final Camera camera = new Camera();
    private ScoreDisplay score;
    private Label message;
    private int points;
    private Coin[] coins;
    private final double worldWidth = 1600;

    @Override public void settings() {
        title("A scrolling world");
        size(640, 360);
    }

    @Override public void setup() {
        sprite = loadImage("/media-demo/player.png");
        sound = loadSound("/media-demo/chime.wav");
        sound.setVolume(0.25);
        score = new ScoreDisplay();
        message = new Label();
        var hud = new HBox(12, score.view(), message);
        hud.setPadding(new Insets(12));
        layout().setBottom(hud);
        resetWorld();
    }

    private void resetWorld() {
        player = new Player(40, 230);
        coins = new Coin[] { new Coin(200, 230), new Coin(760, 230), new Coin(1420, 230) };
        points = 0;
        score.setScore(points);
        camera.follow(player.centreX(), player.centreY(), width(), height(), worldWidth, height());
        message.setText("Move left/right. Find all three coins.");
    }

    @Override public void update(double seconds) {
        int horizontal = 0;
        if (keyDown(KeyCode.LEFT) || keyDown(KeyCode.A)) horizontal--;
        if (keyDown(KeyCode.RIGHT) || keyDown(KeyCode.D)) horizontal++;
        player.update(horizontal, seconds, worldWidth);
        for (Coin coin : coins) {
            if (!coin.isCollected() && coin.touches(player)) {
                coin.collect();
                points++;
                score.setScore(points);
                sound.stop();
                sound.play(); // One collection transition, never every held-key frame.
            }
        }
        camera.follow(player.centreX(), player.centreY(), width(), height(), worldWidth, height());
        if (points == coins.length) message.setText("All coins collected! Keep exploring.");
    }

    @Override public void draw() {
        background(Color.ALICEBLUE);
        var g = graphics();
        g.save();
        try {
            g.translate(-camera.x(), -camera.y());
            fill(Color.SLATEGRAY);
            rect(0, 262, worldWidth, 98);
            for (Coin coin : coins) coin.draw(this);
            player.draw(this, sprite);
        } finally {
            g.restore();
        }
        fill(Color.DARKSLATEGRAY);
        textSize(18);
        text("A/D or arrows: move", 16, 28);
        // ScoreDisplay and the message are native controls outside the canvas.
    }

    private AudioClip loadSound(String path) {
        var resource = getClass().getResource(path);
        if (resource == null) throw new IllegalArgumentException("Sound resource not found: " + path);
        try { return new AudioClip(resource.toExternalForm()); }
        catch (MediaException | IllegalArgumentException failure) {
            throw new IllegalArgumentException("Cannot load sound: " + path, failure);
        }
    }

    public static void main(String[] args) { launch(args); }
}
