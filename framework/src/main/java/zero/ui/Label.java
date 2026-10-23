package zero.ui;

import java.util.Objects;

/** Ordinary text that can be changed by student code. */
public class Label extends Element {
    private final javafx.scene.control.Label label;

    public Label(String text) {
        super(new javafx.scene.control.Label(Objects.requireNonNull(text, "Label text must not be null.")));
        label = (javafx.scene.control.Label) fxNode();
    }

    public String getText() { return label.getText(); }

    public void setText(String text) {
        label.setText(Objects.requireNonNull(text, "Label text must not be null."));
    }
}
