package zero.ui;

import java.util.Objects;

/** A native button with one replaceable click action. */
public class Button extends Element {
    private final javafx.scene.control.Button button;

    public Button(String text) {
        super(new javafx.scene.control.Button(Objects.requireNonNull(text, "Button text must not be null.")));
        button = (javafx.scene.control.Button) fxNode();
    }

    public String getText() { return button.getText(); }

    public void setText(String text) {
        button.setText(Objects.requireNonNull(text, "Button text must not be null."));
    }

    /** Replace the previous action; ordinary mouse and keyboard activation invoke it. */
    public void onClick(Runnable action) {
        Objects.requireNonNull(action, "Button action must not be null.");
        button.setOnAction(event -> action.run());
    }
}
