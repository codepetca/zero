import zero.Color;
import zero.GameApp;
import zero.Key;
import zero.ui.Button;
import zero.ui.Label;
import zero.ui.Row;

public class Main extends GameApp {
    private Player player;
    private Coin[] coins;
    private int points;
    private boolean won;
    private Label scoreLabel;
    private Label message;

    @Override public void settings() { size(640, 360); }

    @Override public void setup() {
        scoreLabel = new Label("");
        message = new Label("");
        Button restartButton = new Button("Restart");
        restartButton.onClick(() -> restart());
        controls(new Row(12, scoreLabel, message, restartButton));
        restart();
    }

    public void restart() {
        player = new Player(52, 192);
        coins = new Coin[] { new Coin(232, 192), new Coin(432, 92), new Coin(552, 312) };
        points = 0;
        won = false;
        scoreLabel.setText("Score: 0");
        message.setText("Collect all " + coins.length + " coins.");
        showGame();
    }

    @Override public void update(double seconds) {
        if (won) return;
        int horizontal = (keyDown(Key.RIGHT) ? 1 : 0) - (keyDown(Key.LEFT) ? 1 : 0);
        int vertical = (keyDown(Key.DOWN) ? 1 : 0) - (keyDown(Key.UP) ? 1 : 0);
        player.steer(horizontal, vertical, seconds);
        player.update(seconds);
        for (Coin coin : coins) {
            coin.update(seconds);
            if (!coin.isCollected() && player.touches(coin)) {
                coin.collect();
                points++;
                scoreLabel.setText("Score: " + points);
            }
        }
        if (points == coins.length) {
            won = true;
            message.setText("You win! Choose Restart.");
        }
    }

    @Override public void draw() {
        background(Color.WHITE);
        for (Coin coin : coins) draw(coin);
        draw(player);
    }

    public static void main(String[] args) { launch(args); }
}
