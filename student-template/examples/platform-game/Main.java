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
    private boolean jumpHeld;
    private Coin[] coins;
    private final double worldWidth = 1600;
    private Platform[] platforms;

    @Override public void settings() {
        title("Jump across platforms");
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
        player = new Player(40, 268);
        coins = new Coin[] { new Coin(120, 268), new Coin(300, 198), new Coin(850, 198), new Coin(1360, 268) };
        points = 0;
        score.setScore(points);
        platforms = new Platform[] { new Platform(0, 300, 480, 60),
                new Platform(580, 300, 520, 60), new Platform(1200, 300, 400, 60),
                new Platform(260, 230, 100, 20), new Platform(780, 230, 120, 20) };
        jumpHeld = keyDown(KeyCode.SPACE) || keyDown(KeyCode.UP);
        camera.follow(player.centreX(), player.centreY(), width(), height(), worldWidth, height());
        message.setText("Jump over gaps. Falling resets the world.");
    }

    @Override public void update(double seconds) {
        int horizontal = 0;
        if (keyDown(KeyCode.LEFT) || keyDown(KeyCode.A)) horizontal--;
        if (keyDown(KeyCode.RIGHT) || keyDown(KeyCode.D)) horizontal++;
        boolean jumpDown = keyDown(KeyCode.SPACE) || keyDown(KeyCode.UP);
        boolean jumpPressed = jumpDown && !jumpHeld;
        jumpHeld = jumpDown;
        player.update(horizontal, jumpPressed, seconds, worldWidth, platforms);
        if (player.y() > height()) { resetWorld(); return; }
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
            for (Platform platform : platforms) platform.draw(this);
            for (Coin coin : coins) coin.draw(this);
            player.draw(this, sprite);
        } finally {
            g.restore();
        }
        fill(Color.DARKSLATEGRAY);
        textSize(18);
        text("A/D or arrows: move    Space or Up: jump", 16, 28);
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
