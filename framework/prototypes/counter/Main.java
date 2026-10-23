import zero.App;
import zero.ui.Button;
import zero.ui.Column;

public class Main extends App {
    private final ScoreDisplay score = new ScoreDisplay();
    private int count;

    public void settings() {
        title("Zero click counter");
        size(320, 220);
        padding(16);
    }

    public void setup() {
        Button add = new Button("Add one");
        Button reset = new Button("Reset");
        add.onClick(() -> {
            count++;
            score.setScore(count);
        });
        reset.onClick(this::reset);
        show(new Column(12, score.view(), add, reset));
    }

    public void reset() {
        count = 0;
        score.setScore(count);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
