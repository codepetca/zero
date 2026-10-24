import zero.ui.Element;
import zero.ui.Label;
import zero.ui.Row;

/** A replacement presentation using the same contract and ordinary Zero controls. */
public class BarScoreDisplay implements ScoreView {
    private final Label number = new Label("Score: 0");
    private final Label bar = new Label("[----------]");
    private final Element view = new Row(number, bar);

    @Override public Element view() { return view; }

    @Override public void setScore(int points) {
        number.setText("Score: " + points);
        int filled = points;
        if (filled < 0) filled = 0;
        if (filled > 10) filled = 10;
        String segments = "";
        for (int i = 0; i < 10; i++) segments += i < filled ? "#" : "-";
        bar.setText("[" + segments + "]");
    }
}
