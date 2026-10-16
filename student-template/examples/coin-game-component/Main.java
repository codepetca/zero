import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.input.KeyCode;
import javafx.scene.layout.HBox;
import javafx.scene.paint.Color;
import zero.GameApp;

/** Main owns game rules; the same ScoreDisplay class also works in a study app. */
public class Main extends GameApp {
    private Player player;
    private Coin[] coins;
    private int points;
    private boolean won;
    private ScoreDisplay score;
    private Label message;
    private Label goal;

    @Override public void settings() {
        title("Coins with a shared score display");
        size(640, 400);
    }

    @Override public void setup() {
        score = new ScoreDisplay();
        goal = new Label();
        message = new Label();
        var restartButton = new Button("Restart");
        restartButton.setOnAction(event -> restart());
        var controls = new HBox(12, score.view(), goal, message, restartButton);
        controls.setPadding(new Insets(12));
        layout().setBottom(controls);
        restart();
    }

    public void restart() {
        player = new Player(40, 180);
        var firstCoin = new Coin(220, 180);
        var secondCoin = new Coin(420, 80);
        var thirdCoin = new Coin(540, 300);
        coins = new Coin[] { firstCoin, secondCoin, thirdCoin };
        points = 0;
        won = false;
        score.setScore(points);
        goal.setText("Goal: " + coins.length + " coins");
        message.setText("Collect every gold square.");
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
        player.update(horizontal, vertical, seconds, width(), height());

        for (Coin coin : coins) {
            if (!coin.isCollected() && coin.touches(player)) {
                coin.collect();
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
        background(Color.ALICEBLUE);
        fill(Color.DARKSLATEGRAY);
        textSize(20);
        text("Click the canvas, then hold the arrow keys.", 20, 30);
        for (Coin coin : coins) {
            coin.draw(this);
        }
        player.draw(this);
    }

    public static void main(String[] args) { launch(args); }
}
