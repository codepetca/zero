import zero.Color;
import zero.GameApp;
import zero.ui.Button;
import zero.ui.Label;
import zero.ui.Row;

public class Main extends GameApp {
    private Player player;
    private PlayerInput input;
    private Coin[] coins;
    private int points;
    private boolean won;
    private ScoreDisplay score;
    private Label message;

    @Override public void settings() {
        padding(20);
        size(640, 400);
    }

    @Override public void setup() {
        input = new PlayerInput(this);
        score = new ScoreDisplay();
        score.setCaption("Score");
        message = new Label("");
        var restartButton = new Button("Restart");
        restartButton.onClick(() -> restart());
        controls(new Row(12, score.view(), message, restartButton));
        restart();
    }

    public void restart() {
        player = new Player(40, 180);
        coins = new Coin[] {
            new Coin(220, 180), new Coin(420, 80), new Coin(540, 300)
        };
        points = 0;
        won = false;
        score.setScore(points);
        message.setText("Collect all " + coins.length + " coins.");
        showGame();
    }

    @Override public void update(double seconds) {
        if (won) return;
        int horizontal = input.horizontal();
        int vertical = input.vertical();
        player.update(horizontal, vertical, seconds, width(), height());

        for (Coin each : coins) {
            if (!each.isCollected() && each.touches(player)) {
                each.collect();
                points++;
                score.setScore(points);
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
        for (Coin each : coins) each.draw(this);
        player.draw(this);
    }

    public static void main(String[] args) { launch(args); }
}
