import zero.Color;
import zero.GameApp;
import zero.Key;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;
import zero.ui.Row;

/** A complete small game: Main owns the rules and explicitly updates its actors. */
public class Main extends GameApp {
    private static final double COURT_TOP = 86;
    private static final double COURT_BOTTOM = 438;
    private static final int WINNING_SCORE = 5;
    private static final Color BACKGROUND = Color.rgb(20, 23, 36);
    private static final Color COURT_LINE = Color.rgb(76, 82, 105);
    private static final Color TEXT = Color.rgb(240, 241, 250);

    private Paddle player;
    private Paddle computer;
    private Ball ball;
    private int playerScore;
    private int computerScore;
    private boolean playing;
    private Label score;
    private Label message;
    private Button pauseButton;

    @Override public void settings() {
        title("Zero Pong");
        size(720, 480);
        padding(16);
    }

    @Override public void setup() {
        score = new Label("You 0 : 0 Computer — first to " + WINNING_SCORE);
        message = new Label("Choose Play to begin.");
        pauseButton = new Button("Pause");
        pauseButton.onClick(() -> togglePause());
        Button restartButton = new Button("Restart");
        restartButton.onClick(() -> restart());
        controls(new Column(8, score, new Row(12, pauseButton, restartButton), message));

        Button playButton = new Button("Play");
        playButton.onClick(() -> restart());
        show(new Column(16,
                new Label("ZERO PONG"),
                new Label("Return the ball with your paddle and score on the computer."),
                new Label("Hold Up / Down or W / S to move your left paddle."),
                new Label("Hit near a paddle's edge to change the ball's angle."),
                new Label("First to " + WINNING_SCORE + " wins. Pause and Restart are below the court."),
                playButton));
    }

    public void restart() {
        double middle = (COURT_TOP + COURT_BOTTOM) / 2;
        player = new Paddle(42, middle, 96, 350, Color.rgb(165, 141, 255), COURT_TOP, COURT_BOTTOM);
        computer = new Paddle(width() - 42, middle, 82, 175, Color.GOLD, COURT_TOP, COURT_BOTTOM);
        ball = new Ball(width() / 2, middle, COURT_TOP, COURT_BOTTOM);
        ball.serve(-1);
        playerScore = 0;
        computerScore = 0;
        playing = true;
        updateScore();
        pauseButton.setEnabled(true);
        pauseButton.setText("Pause");
        message.setText("Up / Down or W / S: move. Space / Escape: pause. R: restart.");
        resume();
        showGame();
    }

    private void togglePause() {
        if (!playing) return;
        if (isPaused()) {
            resume();
            showGame();
            pauseButton.setText("Pause");
            message.setText("Up / Down or W / S: move. Space / Escape: pause. R: restart.");
        } else {
            pause();
            pauseButton.setText("Resume");
            message.setText("Paused. Choose Resume to continue, or Restart for a new match.");
        }
    }

    @Override public void update(double seconds) {
        if (keyPressed(Key.R)) {
            restart();
            return;
        }
        if (!playing) return;
        if (keyPressed(Key.SPACE) || keyPressed(Key.ESCAPE)) {
            togglePause();
            return;
        }

        int direction = 0;
        if (keyDown(Key.UP) || keyDown(Key.W)) direction--;
        if (keyDown(Key.DOWN) || keyDown(Key.S)) direction++;
        player.setDirection(direction);

        // Short steps keep a fast ball from skipping over a thin paddle.
        double remaining = Math.min(seconds, 0.1);
        while (remaining > 0 && playing) {
            double step = Math.min(remaining, 1.0 / 120);
            double targetY = (COURT_TOP + COURT_BOTTOM) / 2;
            // The computer reacts late and has a speed limit: it can miss.
            if (ball.movingRight() && ball.x() > width() * 0.6) targetY = ball.y();
            computer.aimAt(targetY);
            player.update(step);
            computer.update(step);
            ball.update(step);
            ball.bounceOff(player, true);
            ball.bounceOff(computer, false);

            if (ball.x() + ball.width() / 2 < 0) awardPoint(false);
            else if (ball.x() - ball.width() / 2 > width()) awardPoint(true);
            remaining -= step;
        }
    }

    private void awardPoint(boolean playerPoint) {
        if (playerPoint) playerScore++;
        else computerScore++;
        updateScore();
        if (playerScore == WINNING_SCORE || computerScore == WINNING_SCORE) {
            playing = false;
            pauseButton.setEnabled(false);
            message.setText(playerScore == WINNING_SCORE
                    ? "You win! Choose Restart or press R for a new match."
                    : "Computer wins. Choose Restart or press R to try again.");
        } else {
            ball.serve(playerPoint ? 1 : -1);
            message.setText(playerPoint ? "You scored! Get ready for the next serve."
                    : "Computer scored. Get ready for the next serve.");
        }
    }

    private void updateScore() {
        score.setText("You " + playerScore + " : " + computerScore + " Computer — first to " + WINNING_SCORE);
    }

    @Override public void draw() {
        background(BACKGROUND);
        fill(TEXT);
        textSize(26);
        textCentered("ZERO PONG", width() / 2, 34);
        textSize(16);
        textCentered("YOU                                      COMPUTER", width() / 2, 65);
        stroke(COURT_LINE);
        strokeWidth(2);
        line(20, COURT_TOP, width() - 20, COURT_TOP);
        line(20, COURT_BOTTOM, width() - 20, COURT_BOTTOM);
        for (double y = COURT_TOP + 12; y < COURT_BOTTOM; y += 24) {
            line(width() / 2, y, width() / 2, y + 12);
        }
        draw(player);
        draw(computer);
        draw(ball);
        fill(TEXT);
        textSize(15);
        textCentered("Aim with your paddle's edge. Click the court if keys do not respond.", width() / 2, 467);
        if (isPaused()) drawBanner("Paused", "Choose Resume below the court.");
        else if (!playing) drawBanner(playerScore == WINNING_SCORE ? "You win!" : "Computer wins",
                "Choose Restart or press R to play again.");
        else if (ball.isServing()) {
            textSize(20);
            textCentered("Get ready!", width() / 2, COURT_TOP + 38);
        }
    }

    private void drawBanner(String heading, String detail) {
        fill(BACKGROUND);
        rect(120, 205, 480, 112);
        stroke(COURT_LINE);
        outlineRect(120, 205, 480, 112);
        fill(TEXT);
        textSize(30);
        textCentered(heading, width() / 2, 250);
        textSize(17);
        textCentered(detail, width() / 2, 286);
    }

    public static void main(String[] args) { launch(args); }
}
