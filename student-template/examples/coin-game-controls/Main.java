import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.input.KeyCode;
import javafx.scene.layout.HBox;
import javafx.scene.paint.Color;
import zero.SketchApp;

/** One coin and ordinary controls: Main owns the score and reset rule. */
public class Main extends SketchApp {
    private Player player;
    private Coin coin;
    private int points;
    private Label score;
    private Label message;

    @Override public void settings() {
        title("One coin and controls");
        size(640, 400);
    }

    @Override public void setup() {
        score = new Label();
        message = new Label();
        var restartButton = new Button("Restart");
        restartButton.setOnAction(event -> restart());
        var controls = new HBox(12, score, message, restartButton);
        controls.setPadding(new Insets(12));
        layout().setBottom(controls);
        restart();
    }

    public void restart() {
        player = new Player(40, 180);
        coin = new Coin(220, 180);
        points = 0;
        score.setText("Score: 0 / 1");
        message.setText("Collect the gold square.");
        canvas().requestFocus();
    }

    @Override public void update(double seconds) {
        int horizontal = 0;
        int vertical = 0;
        if (keyDown(KeyCode.LEFT)) horizontal--;
        if (keyDown(KeyCode.RIGHT)) horizontal++;
        if (keyDown(KeyCode.UP)) vertical--;
        if (keyDown(KeyCode.DOWN)) vertical++;
        player.update(horizontal, vertical, seconds, width(), height());
        if (!coin.isCollected() && coin.touches(player)) {
            coin.collect();
            points++;
            score.setText("Score: " + points + " / 1");
            message.setText("Collected! Keep moving or choose Restart.");
        }
    }

    @Override public void draw() {
        background(Color.ALICEBLUE);
        fill(Color.DARKSLATEGRAY);
        textSize(20);
        text("Click the canvas, then hold the arrow keys.", 20, 30);
        coin.draw(this);
        player.draw(this);
    }

    public static void main(String[] args) { launch(args); }
}
