package zero.ui;

import java.util.Objects;

/** A single-line input whose current text is read explicitly by student code. */
public class TextField extends Element {
    private final javafx.scene.control.TextField field;

    public TextField() {
        super(new javafx.scene.control.TextField());
        field = (javafx.scene.control.TextField) fxNode();
        field.setText("");
        field.setPromptText("");
    }

    public String getText() { return field.getText(); }

    public void setText(String text) {
        field.setText(Objects.requireNonNull(text, "TextField text must not be null."));
    }

    public String getPromptText() { return field.getPromptText(); }

    public void setPromptText(String text) {
        field.setPromptText(Objects.requireNonNull(text, "TextField prompt text must not be null."));
    }
}
