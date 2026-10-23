import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Element;
import zero.ui.Label;

public class ResultsScreen {
    private final Element view;

    public ResultsScreen(boolean won, int score, double seconds, Runnable playAgain,
            Runnable title) {
        Button againButton = new Button("Play again");
        againButton.onClick(playAgain);
        Button titleButton = new Button("Title screen");
        titleButton.onClick(title);
        view = new Column(14,
                new Label(won ? "You win!" : "Time's up!"),
                new Label("Final score: " + score + " / 6"),
                new Label("Playing time: " + (int) Math.ceil(seconds) + "s"),
                new Label(won ? "Every coin collected. Ready for another run?"
                        : "Try a shorter route between the coins."),
                againButton, titleButton);
    }

    public Element view() { return view; }
}
