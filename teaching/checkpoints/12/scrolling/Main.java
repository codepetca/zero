import zero.Color;
import zero.GameApp;
import zero.ImageRegion;
import zero.Sound;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;
import zero.ui.Row;

public class Main extends GameApp {
    private final double worldWidth = 1600;
    private Player player;
    private PlayerInput input;
    private Camera camera;
    private Coin[] coins;
    private int points;
    private boolean won;
    private ScoreDisplay score;
    private Label message;
    private Label soundStatus;
    private Label assetStatus;
    private ImageRegion sprite;
    private Sound chime;
    private int plays;

    @Override public void settings() {
        padding(20);
        size(640, 400);
    }

    @Override public void setup() {
        input = new PlayerInput(this);
        score = new ScoreDisplay();
        score.setCaption("Score");
        message = new Label("");
        var badge = new CreditsBadge("Coin game");
        soundStatus = new Label("");
        var restartButton = new Button("Restart");
        restartButton.onClick(() -> restart());
        assetStatus = new Label("Drawing mode");
        var artworkButton = new Button("Use artwork and sound");
        artworkButton.onClick(() -> loadAssets());
        controls(new Column(8,
                new Row(12, score.view(), soundStatus, message, restartButton),
                new Row(12, artworkButton, assetStatus), badge.view()));
        restart();
    }

    /** Keep drawing playable if a requested resource is missing or invalid. */
    public void loadAssets() {
        try {
            ImageRegion nextSprite = loadImageRegion("/media-demo/player.png");
            Sound nextChime = loadSound("/media-demo/chime.wav");
            nextChime.setVolume(0.25);
            sprite = nextSprite;
            chime = nextChime;
            assetStatus.setText("Artwork and sound ready");
        } catch (IllegalArgumentException failure) {
            assetStatus.setText(failure.getMessage());
        }
        showGame();
    }

    public void restart() {
        if (chime != null) chime.stop();
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
        showGame();
    }

    @Override public void update(double seconds) {
        if (won) return;
        int horizontal = input.horizontal();
        int vertical = input.vertical();
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
        background(Color.rgb(240, 248, 255));
        fill(Color.rgb(47, 79, 79));
        textSize(20);
        text("Click the canvas, then hold arrows or WASD.", 20, 30);
        for (Coin each : coins) each.draw(this, camera.x());
        if (sprite == null) player.draw(this, camera.x());
        else player.drawImage(this, sprite, camera.x());
    }

    public static void main(String[] args) { launch(args); }
}
