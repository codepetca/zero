import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Element;
import zero.ui.Label;
import zero.ui.Row;

/** UI displays values; Main owns the actual game state. */
public class Hud {
    private final ScoreView score;
    private final Label level = new Label("Level 1 of 2 — collect 3 coins.");
    private final Label timer = new Label("Time left: 30s");
    private final Element view;

    public Hud(ScoreView score, Runnable pause, Runnable restart, Runnable textScore, Runnable barScore) {
        this.score = score;
        Button pauseButton = new Button("Pause");
        pauseButton.onClick(pause);
        Button restartButton = new Button("Restart game");
        restartButton.onClick(restart);
        Button text = new Button("Text score");
        Button bar = new Button("Bar score");
        text.onClick(textScore);
        bar.onClick(barScore);
        view = new Column(6, level, score.view(), timer, new Row(pauseButton, restartButton, text, bar));
    }

    public Element view() { return view; }

    public void update(int currentLevel, int points, double seconds) {
        level.setText("Level " + currentLevel + " of 2 — collect 3 coins.");
        score.setScore(points);
        timer.setText("Time left: " + (int) Math.ceil(seconds) + "s");
    }
}
