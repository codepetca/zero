import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Element;
import zero.ui.Label;

public class HelpScreen {
    private final Element view;

    public HelpScreen(Runnable back) {
        Button backButton = new Button("Back");
        backButton.onClick(back);
        view = new Column(12,
                new Label("How to play"),
                new Label("Move your pointer across the field. The blue player follows it."),
                new Label("Collect three gold coins in each of two levels."),
                new Label("Each level gives you 30 seconds, starting when you first move."),
                new Label("Pause takes a break. Resume keeps your score and remaining time."),
                new Label("After resuming, move your pointer again to continue."),
                backButton);
    }

    public Element view() { return view; }
}
