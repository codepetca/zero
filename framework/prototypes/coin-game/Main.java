import zero.Color;
import zero.GameApp;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;

public class Main extends GameApp {
    private final ScoreDisplay score = new ScoreDisplay();
    private final Label status = new Label("Collect all 3 coins.");
    private Player player;
    private Coin[] coins;
    private int points;
    private boolean started;
    private double idlePointerX;
    private double idlePointerY;

    public void settings() {
        title("Zero pointer coin game");
        size(440, 240);
        padding(16);
    }

    public void setup() {
        Button restart = new Button("Restart");
        restart.onClick(this::restart);
        controls(new Column(8, score.view(), status, restart));
        restart();
    }

    public void restart() {
        player = new Player(40, 180);
        coins = new Coin[] {new Coin(100, 60), new Coin(220, 180), new Coin(360, 60)};
        points = 0;
        started = false;
        idlePointerX = mouseX();
        idlePointerY = mouseY();
        score.setScore(points);
        status.setText("Collect all 3 coins.");
    }

    public void update(double seconds) {
        if (points == coins.length) return;
        if (mouseX() != idlePointerX || mouseY() != idlePointerY) started = true;
        if (!started) return;
        player.moveToward(mouseX(), mouseY(), seconds);
        for (Coin coin : coins) {
            if (coin.collectIfTouching(player)) {
                points++;
                score.setScore(points);
            }
        }
        if (points == coins.length) status.setText("You win! Press Restart to play again.");
    }

    public void draw() {
        background(Color.WHITE);
        fill(Color.GOLD);
        for (Coin coin : coins) {
            if (!coin.collected) circle(coin.x, coin.y, coin.radius * 2);
        }
        fill(Color.BLUE);
        circle(player.x, player.y, player.radius * 2);
        stroke(Color.BLACK);
        outlineRect(0, 0, width(), height());
    }

    public static void main(String[] args) {
        launch(args);
    }
}
