import javafx.geometry.Insets;
import javafx.scene.control.Label;
import javafx.scene.image.Image;
import javafx.scene.input.KeyCode;
import javafx.scene.layout.HBox;
import javafx.scene.media.AudioClip;
import javafx.scene.media.MediaException;
import javafx.scene.paint.Color;
import zero.SketchApp;
import javafx.scene.control.Button;

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
    private Level[] levels;
    private int levelIndex;
    private int bankedPoints;
    private boolean won;
    private boolean lost;

    @Override public void settings() {
        title("My complete game");
        size(640, 360);
    }

    @Override public void setup() {
        sprite = loadImage("/media-demo/player.png");
        sound = loadSound("/media-demo/chime.wav");
        sound.setVolume(0.25);
        score = new ScoreDisplay();
        message = new Label();
        var restart = new Button("Restart");
        restart.setOnAction(event -> restart());
        var hud = new HBox(12, score.view(), message, restart);
        hud.setPadding(new Insets(12));
        layout().setBottom(hud);
        restart();
    }

    public void restart() {
        levels = Level.createLevels();
        levelIndex = 0;
        points = 0;
        bankedPoints = 0;
        won = false;
        lost = false;
        enterLevel();
        canvas().requestFocus();
    }

    private void enterLevel() {
        var level = levels[levelIndex];
        player = new Player(level.startX, level.startY);
        // Suppress a still-held jump until it has been released.
        jumpHeld = keyDown(KeyCode.SPACE) || keyDown(KeyCode.UP);
        camera.follow(player.centreX(), player.centreY(), width(), height(), level.width, level.height);
        score.setScore(points);
        message.setText("Level " + (levelIndex + 1) + ": coins first, then green exit.");
    }

    @Override public void update(double seconds) {
        if (won || lost) return;
        int horizontal = 0;
        if (keyDown(KeyCode.LEFT) || keyDown(KeyCode.A)) horizontal--;
        if (keyDown(KeyCode.RIGHT) || keyDown(KeyCode.D)) horizontal++;
        boolean jumpDown = keyDown(KeyCode.SPACE) || keyDown(KeyCode.UP);
        boolean jumpPressed = jumpDown && !jumpHeld;
        jumpHeld = jumpDown;
        var level = levels[levelIndex];
        player.update(horizontal, jumpPressed, seconds, level.width, level.platforms);
        boolean danger = player.y() > level.height;
        for (Enemy enemy : level.enemies) {
            enemy.update(Math.max(0, Math.min(seconds, 0.1)));
            if (enemy.touches(player)) danger = true;
        }
        if (danger) {
            lost = true;
            message.setText("You lost! Choose Restart.");
            return;
        }
        for (Coin coin : level.coins) {
            if (!coin.isCollected() && coin.touches(player)) {
                coin.collect();
                points++;
                score.setScore(points);
                sound.stop();
                sound.play(); // One collection transition, never every held-key frame.
            }
        }
        if (level.allCollected() && player.touches(level.exitX, level.exitY, 40, 56)) {
            bankedPoints = points;
            levelIndex++;
            if (levelIndex == levels.length) {
                levelIndex = levels.length - 1;
                won = true;
                message.setText("You win! All eight coins. Restart?");
            } else enterLevel();
            return;
        }
        camera.follow(player.centreX(), player.centreY(), width(), height(), level.width, level.height);
    }

    @Override public void draw() {
        background(Color.ALICEBLUE);
        var g = graphics();
        g.save();
        try {
            g.translate(-camera.x(), -camera.y());
            var level = levels[levelIndex];
            for (Platform platform : level.platforms) platform.draw(this);
            fill(level.allCollected() ? Color.LIMEGREEN : Color.DARKGREEN);
            rect(level.exitX, level.exitY, 40, 56);
            for (Coin coin : level.coins) coin.draw(this);
            for (Enemy enemy : level.enemies) enemy.draw(this);
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
