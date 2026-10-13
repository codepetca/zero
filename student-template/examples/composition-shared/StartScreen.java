import javafx.geometry.Insets;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;

/** A reusable welcome view. Main decides what starting means. */
public class StartScreen {
    private final VBox view;

    public StartScreen(String title, String instructions, Runnable onStart) {
        if (onStart == null) throw new IllegalArgumentException("Start needs an action.");
        Label heading = new Label(title);
        heading.setWrapText(true);
        Label message = new Label(instructions);
        message.setWrapText(true);
        Button start = new Button("Start");
        start.setOnAction(event -> onStart.run());
        view = new VBox(12, heading, message, start);
        view.setPadding(new Insets(20));
    }

    public Node view() { return view; }
}
