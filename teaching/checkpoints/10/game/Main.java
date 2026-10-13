import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.input.KeyCode;
import javafx.scene.layout.HBox;
import javafx.scene.paint.Color;
import zero.SketchApp;

public class Main extends SketchApp {
    private Player player;
    private Coin[] coins;
    private int points;
    private boolean won;
    private ScoreDisplay score;
    private Label message;

    @Override public void settings() {
        size(640, 400);
    }

    @Override public void setup() {
        score = new ScoreDisplay();
        message = new Label();
        var restartButton = new Button("Restart");
        restartButton.setOnAction(event -> restart());
        var controls = new HBox(12, score.view(), message, restartButton);
        controls.setPadding(new Insets(12));
        layout().setBottom(controls);
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
        background(Color.ALICEBLUE);
        fill(Color.DARKSLATEGRAY);
        textSize(20);
        text("Click the canvas, then hold the arrow keys.", 20, 30);
        for (Coin each : coins) each.draw(this);
        player.draw(this);
    }

    public static void main(String[] args) { launch(args); }
}
