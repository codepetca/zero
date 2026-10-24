import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Element;
import zero.ui.Label;

/** A screen can begin as an ordinary object that supplies a UI view. */
public class TitleScreen {
    private final Element view;

    public TitleScreen(Runnable play, Runnable help) {
        Button playButton = new Button("Play");
        playButton.onClick(play);
        Button helpButton = new Button("How to play");
        helpButton.onClick(help);
        view = new Column(14,
                new Label("COIN QUEST"),
                new Label("Two fields. Six coins. Beat the clock."),
                new Label("A small Java game built with Zero."),
                playButton, helpButton);
    }

    public Element view() { return view; }
}
