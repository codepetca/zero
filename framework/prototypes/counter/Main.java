import zero.App;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Row;

public class Main extends App {
    private ScoreView score;
    private int count;

    public void settings() {
        title("Zero click counter");
        size(320, 220);
        padding(16);
    }

    public void setup() {
        selectScore(new ScoreDisplay());
    }

    /** Select a fresh presentation while retaining the app-owned count. */
    public void selectScore(ScoreView presentation) {
        score = presentation;
        score.setScore(count);
        Button text = new Button("Text score");
        Button bar = new Button("Bar score");
        text.onClick(() -> selectScore(new ScoreDisplay()));
        bar.onClick(() -> selectScore(new BarScoreDisplay()));
        Button add = new Button("Add one");
        Button reset = new Button("Reset");
        add.onClick(() -> {
            count++;
            score.setScore(count);
        });
        reset.onClick(this::reset);
        show(new Column(12, new Row(text, bar), score.view(), new Row(add, reset)));
    }

    public void reset() {
        count = 0;
        score.setScore(count);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
