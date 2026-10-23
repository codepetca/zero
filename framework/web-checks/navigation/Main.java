import javafx.scene.input.KeyCode;
import javafx.scene.input.MouseButton;
import zero.GameApp;
import zero.Color;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;
import zero.ui.TextField;

/** Real-browser behavior probe for the small Zero-owned UI surface. */
public final class Main extends GameApp {
    private final Label status = new Label("Before");
    private int clicks, frames, draws;
    private boolean firstPlay = true, expectZero, deferView, deferredDraw;
    private final Label navigation = new Label("Navigation ready");
    @Override public void settings() { title("Zero UI check"); size(320, 180); padding(0); }
    @Override public void setup() {
        require(status.getText().equals("Before"), "Label constructor text");
        status.setText("Zero UI ready");
        require(status.getText().equals("Zero UI ready"), "Label replacement text");
        Button button = new Button("Before");
        button.setText("Zero button");
        require(button.getText().equals("Zero button"), "Button replacement text");
        button.onClick(() -> { throw new IllegalStateException("Old callback must be replaced"); });
        button.onClick(() -> { clicks++; status.setText("Zero clicks: " + clicks); });
        Column defaultColumn = new Column();
        require(defaultColumn.getSpacing() == 8, "Default column spacing");
        Button replace = new Button("Replace controls");
        replace.onClick(() -> controls(navigationControls()));
        Column controls = new Column(8, status, button, replace,
                new Label("Title idle check ready"), new Label("Pause check ready"),
                new Label("Deferred view check ready"), new Label("Input reset check ready"));
        controls.setSpacing(12);
        require(controls.getSpacing() == 12, "Column spacing change");
        boolean invalid = false;
        try { controls.setSpacing(Double.NaN); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid && controls.getSpacing() == 12, "Column spacing atomic validation");
        invalid = false;
        try { new Column(-1); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid, "Negative spacing rejected");
        Label shared = new Label("Shared");
        invalid = false;
        try { new Column(shared, shared); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid, "Duplicate children rejected");
        new Column(shared);
        invalid = false;
        try { new Column(shared); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid, "Parented child rejected");
        invalid = false;
        try { Color.rgb(0, 256, 0); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid, "Zero Color validates channels");
        controls(controls);
        controls(controls);
        showTitle();
    }
    private Column navigationControls() {
        Button menu = new Button("Open probe menu");
        menu.onClick(this::showMenu);
        Button pause = new Button("Pause frame loop");
        pause.onClick(() -> { pause(); require(isPaused(), "Explicit pause flag"); });
        Button resume = new Button("Resume frame loop");
        resume.onClick(() -> { expectZero = true; resume(); require(!isPaused(), "Explicit resume flag"); });
        Button deferred = new Button("Defer probe view");
        deferred.onClick(() -> deferView = true);
        return new Column(8, new Label("Replacement HUD"), navigation, menu, pause, resume, deferred);
    }
    private void showTitle() {
        TextField name = new TextField();
        require(name.getText().equals("") && name.getPromptText().equals(""), "TextField empty defaults");
        name.setText("Before");
        name.setPromptText("Your name");
        boolean invalidText = false, invalidPrompt = false;
        try { name.setText(null); } catch (Throwable expected) {
            invalidText = expected.getMessage().contains("TextField text");
        }
        try { name.setPromptText(null); } catch (Throwable expected) {
            invalidPrompt = expected.getMessage().contains("TextField prompt");
        }
        require(invalidText && invalidPrompt && name.getText().equals("Before")
                && name.getPromptText().equals("Your name"), "TextField errors preserve values");
        name.setText("");
        Label greeting = new Label("TextField checks ready");
        Button disabled = new Button("Disabled greeting action");
        disabled.setEnabled(false);
        disabled.onClick(() -> { throw new IllegalStateException("Disabled button must be skipped"); });
        Label actions = new Label("Greeting actions: 0");
        int[] actionCount = {0};
        Button greet = new Button("Greet probe");
        greet.onClick(() -> {
            greeting.setText("Hello, " + name.getText() + "!");
            actions.setText("Greeting actions: " + ++actionCount[0]);
        });
        Button toggle = new Button("Disable greeting controls");
        boolean[] enabled = {true};
        toggle.onClick(() -> {
            enabled[0] = !enabled[0];
            name.setEnabled(enabled[0]);
            greet.setEnabled(enabled[0]);
            toggle.setText(enabled[0] ? "Disable greeting controls" : "Enable greeting controls");
        });
        Button play = new Button("Play probe");
        play.onClick(() -> {
            if (firstPlay) {
                require(frames == 0 && draws == 0, "Title must not run game frames");
                firstPlay = false;
            }
            expectZero = true;
            showGame();
        });
        show(new Column(new Label("Probe title"), name, disabled, greet, greeting, actions, toggle, play));
    }
    private void showMenu() {
        Button back = new Button("Return to probe game");
        back.onClick(() -> { expectZero = true; showGame(); });
        Button title = new Button("Probe title screen");
        title.onClick(this::showTitle);
        show(new Column(new Label("Probe menu"), back, title));
    }
    @Override public void update(double seconds) {
        if (expectZero) {
            require(seconds == 0, "First returned frame must have zero seconds");
            require(!keyDown(KeyCode.A) && !keyPressed(KeyCode.A)
                    && !mouseDown(MouseButton.PRIMARY), "Returning clears held input");
            navigation.setText("Resume checks ready");
            expectZero = false;
        }
        frames++;
        if (deferView) {
            deferView = false;
            Button back = new Button("Return to probe game");
            back.onClick(() -> { expectZero = true; showGame(); });
            show(new Column(new Label("Deferred view"), back));
            deferredDraw = true;
        }
    }
    @Override public void draw() {
        draws++;
        background(Color.WHITE);
        fill(Color.BLACK); textSize(16);
        text("Zero UI frames: " + frames, 10, 25);
        text("Zero UI pointer: " + (int) mouseX() + "," + (int) mouseY(), 10, 50);
        text("Probe state: " + frames + "," + draws + "," + isPaused(), 10, 150);
        if (deferredDraw) { text("Deferred draw completed", 10, 170); deferredDraw = false; }
        fill(Color.rgb(17, 99, 203)); rect(10, 70, 20, 20);
        fill(Color.BLUE); rect(40, 70, 20, 20);
        fill(Color.GOLD); rect(70, 70, 20, 20);
        stroke(Color.BLACK); strokeWidth(2); outlineRect(100, 70, 20, 20);
    }
    private static void require(boolean condition, String name) {
        if (!condition) throw new IllegalStateException(name);
    }
    public static void main(String[] args) { launch(args); }
}
