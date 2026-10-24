import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Element;
import zero.ui.Label;

public class PauseScreen {
    private final Element view;

    public PauseScreen(int level, int score, int seconds, Runnable resume,
            Runnable restart, Runnable title) {
        Button resumeButton = new Button("Resume");
        resumeButton.onClick(resume);
        Button restartButton = new Button("Restart game");
        restartButton.onClick(restart);
        Button titleButton = new Button("Title screen");
        titleButton.onClick(title);
        view = new Column(12,
                new Label("Paused"),
                new Label("Level " + level + " of 2"),
                new Label("Score: " + score + " / 6"),
                new Label("Time left: " + seconds + "s"),
                resumeButton, restartButton, titleButton);
    }

    public Element view() { return view; }
}
