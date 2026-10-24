package zero;

import javafx.scene.input.KeyCode;

/** The four arrow keys available to ordinary Zero game input. */
public enum Key {
    LEFT(KeyCode.LEFT),
    RIGHT(KeyCode.RIGHT),
    UP(KeyCode.UP),
    DOWN(KeyCode.DOWN);

    private final KeyCode keyCode;

    Key(KeyCode keyCode) { this.keyCode = keyCode; }

    KeyCode fxKeyCode() { return keyCode; }
}
