import evidence.ApiProof;
import evidence.ApiSignatureChecks;
import javafx.scene.input.KeyCode;
import javafx.scene.input.MouseButton;
import zero.GameApp;
import zero.Color;
import zero.Key;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;
import zero.ui.TextField;
import zero.ui.Row;

/** Real-browser behavior probe for the small Zero-owned UI surface. */
public final class Main extends GameApp {
    private final Label status = new Label("Before");
    private int clicks, frames, draws;
    private boolean firstPlay = true, expectZero, deferView, deferredDraw;
    private final Label navigation = new Label("Navigation ready");
    private final Key[] arrowKeys = {Key.LEFT, Key.RIGHT, Key.UP, Key.DOWN};
    private final int[] keyEdges = new int[4];
    private int keyMask;
    @Override public void settings() { title("Zero UI check"); size(320, 180); padding(0); }
    @Override public void setup() {
        ApiSignatureChecks.ui();
        require(status.getText().equals("Before"), "Label constructor text");
        status.setText("Zero UI ready");
        require(status.getText().equals("Zero UI ready"), "Label replacement text");
        Button button = new Button("Before");
        button.setText("Zero button");
        require(button.getText().equals("Zero button"), "Button replacement text");
        button.onClick(() -> { throw new IllegalStateException("Old callback must be replaced"); });
        button.onClick(() -> { clicks++; status.setText("Zero clicks: " + clicks); });
        Row counterRow = new Row(status, button);
        require(counterRow.getSpacing() == 8, "Row default spacing");
        counterRow.setSpacing(12);
        require(counterRow.getSpacing() == 12 && new Row(6).getSpacing() == 6, "Row spacing and explicit constructor");
        boolean rowInvalid = false;
        try { counterRow.setSpacing(Double.NaN); } catch (IllegalArgumentException expected) { rowInvalid = true; }
        require(rowInvalid && counterRow.getSpacing() == 12, "Row invalid setter preserves spacing");
        Label rowFresh = new Label("Row validation");
        rowInvalid = false;
        try { new Row(-1, rowFresh); } catch (IllegalArgumentException expected) { rowInvalid = true; }
        require(rowInvalid, "Row negative constructor spacing rejected");
        new Row(rowFresh); // Succeeds only if the failed constructor left the child unowned.
        rowInvalid = false;
        try { new Row(rowFresh); } catch (IllegalArgumentException expected) { rowInvalid = true; }
        require(rowInvalid, "Row parent ownership rejected");
        Label rowDuplicate = new Label("Duplicate");
        rowInvalid = false;
        try { new Row(rowDuplicate, rowDuplicate); } catch (IllegalArgumentException expected) { rowInvalid = true; }
        require(rowInvalid, "Row duplicate child rejected");
        new Row(rowDuplicate); // Duplicate validation must also finish before attachment.
        rowInvalid = false;
        try { new Row((zero.ui.Element[]) null); } catch (Throwable expected) { rowInvalid = expected.getMessage().contains("Row children"); }
        require(rowInvalid, "Row null child array has a useful error");
        for (Runnable query : new Runnable[] {() -> keyDown((Key) null), () -> keyPressed((Key) null)}) {
            boolean rejected = false;
            try { query.run(); } catch (Throwable expected) { rejected = "Key must not be null.".equals(expected.getMessage()); }
            require(rejected, "Zero key null errors");
        }
        Column defaultColumn = new Column();
        require(defaultColumn.getSpacing() == 8, "Default column spacing");
        Button replace = new Button("Replace controls");
        replace.onClick(() -> controls(navigationControls()));
        Column controls = new Column(8, counterRow, replace,
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
        Column inputGroup = new Column(name, disabled, greet);
        Button groupToggle = new Button("Disable input group");
        boolean[] groupEnabled = {true};
        groupToggle.onClick(() -> {
            groupEnabled[0] = !groupEnabled[0];
            inputGroup.setEnabled(groupEnabled[0]);
            groupToggle.setText(groupEnabled[0] ? "Disable input group" : "Enable input group");
        });
        Button enableChild = new Button("Enable children inside group");
        enableChild.onClick(() -> { name.setEnabled(true); greet.setEnabled(true); });
        Button mounted = new Button("Show initially disabled group");
        mounted.onClick(this::showInitiallyDisabledGroup);
        Button play = new Button("Play probe");
        play.onClick(() -> {
            if (firstPlay) {
                require(frames == 0 && draws == 0, "Title must not run game frames");
                firstPlay = false;
            }
            expectZero = true;
            showGame();
        });
        show(new Column(new Label("Probe title"), inputGroup, greeting, actions, toggle,
                groupToggle, enableChild, mounted, play));
    }
    private void showInitiallyDisabledGroup() {
        TextField field = new TextField();
        field.setText("Retained");
        Label count = new Label("Mounted group actions: 0");
        int[] actions = {0};
        Button action = new Button("Mounted group action");
        action.onClick(() -> count.setText("Mounted group actions: " + ++actions[0]));
        Column group = new Column(field, action);
        group.setEnabled(false);
        Button enable = new Button("Enable mounted group");
        enable.onClick(() -> group.setEnabled(true));
        Button back = new Button("Return to probe title");
        back.onClick(this::showTitle);
        show(new Column(new Label("Initially disabled group"), group, count, enable, back));
    }
    private void showMenu() {
        Button back = new Button("Return to probe game");
        back.onClick(() -> { expectZero = true; showGame(); });
        Button title = new Button("Probe title screen");
        title.onClick(this::showTitle);
        show(new Column(new Label("Probe menu"), back, title));
    }
    @Override public void update(double seconds) {
        if(mouseDown(MouseButton.PRIMARY)&&mouseX()==80&&mouseY()==80)ApiSignatureChecks.pointerHeld(this,80,80);
        if(mousePressed(MouseButton.PRIMARY))ApiSignatureChecks.pointerPressed(this);
        keyMask = 0;
        for (int index = 0; index < arrowKeys.length; index++) {
            Key arrow = arrowKeys[index];
            if (keyDown(arrow)) keyMask |= 1 << index;
            boolean pressed = keyPressed(arrow);
            require(pressed == keyPressed(arrow), "Zero key edge queries do not consume input");
            if (pressed) { keyEdges[index]++; ApiSignatureChecks.arrows(this,index); if(index==0&&keyDown(arrow))ApiSignatureChecks.held(this); }
        }
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
        text(ApiProof.events(),-10000,-10000);
        draws++;
        background(Color.WHITE);
        fill(Color.BLACK); textSize(16);
        text("Zero UI frames: " + frames, 10, 25);
        text("Zero UI pointer: " + (int) mouseX() + "," + (int) mouseY(), 10, 50);
        for (Key arrow : arrowKeys) require(keyPressed(arrow) == keyPressed(arrow), "Zero key repeated draw query");
        text("Zero key mask: " + keyMask, 10, 110);
        text("Zero key edges: " + keyEdges[0] + "," + keyEdges[1] + "," + keyEdges[2] + "," + keyEdges[3], 10, 130);
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
