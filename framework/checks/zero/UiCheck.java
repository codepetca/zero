package zero;

import javafx.application.Platform;
import javafx.event.Event;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.image.WritableImage;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyEvent;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.stage.Stage;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Element;
import zero.ui.Label;
import zero.ui.TextField;
import zero.ui.Row;

/** Finite native checks for Zero UI composition and live game controls. */
public final class UiCheck extends GameApp {
    private int phase, updates, score, resets, greetings;
    private long phaseStarted = System.nanoTime();
    private Label scoreLabel;
    private Button reset;
    private Column hud;
    private TextField name;
    private Label greeting;
    private Button greet;

    @Override public void settings() { size(320, 180); title("Zero UI checks"); }

    @Override public void setup() {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_UI_TIMEOUT phase=" + phase);
            System.exit(1);
        }, "zero-ui-deadline");
        watchdog.setDaemon(true);
        watchdog.start();
        verifyComponents();
        verifyApp();
        verifyColors();
        scoreLabel = new Label("Score: 0");
        reset = new Button("Reset");
        reset.onClick(() -> {
            score = 0;
            resets++;
            scoreLabel.setText("Score: 0");
        });
        name = new TextField();
        name.setPromptText("Your name");
        greeting = new Label("Waiting for a name");
        greet = new Button("Say hello");
        greet.onClick(() -> { greetings++; greeting.setText("Hello, " + name.getText() + "!"); });
        hud = new Column(scoreLabel, reset, new Row(name, greet), greeting);
        controls(hud);
        controls(hud);
        Column replacement = new Column(new Label("Temporary controls"));
        controls(replacement);
        require(hud.fxNode().getParent() == null, "replaced HUD is available for reuse");
        controls(hud);
        Label owned = new Label("Owned elsewhere");
        Column owner = new Column(owned);
        expectIllegal(() -> controls(owned));
        expectNull(() -> controls(null));
        require(layout().getBottom() == hud.fxNode() && owned.fxNode().getParent() == owner.fxNode(),
                "invalid controls preserve both layouts");
        require(layout().getCenter() == canvas(), "live controls preserve canvas");
        expectState(() -> new GameApp() { }.controls(new Label("Too early")));
    }

    private static void verifyComponents() {
        expectNull(() -> new Bridge(null));
        expectNull(() -> new Label(null));
        expectNull(() -> new Button(null));
        TextField field = new TextField();
        require(field.getText().equals("") && field.getPromptText().equals(""), "empty text and prompt defaults");
        field.setText("Ada");
        field.setPromptText("Your name");
        expectNull(() -> field.setText(null));
        expectNull(() -> field.setPromptText(null));
        require(field.getText().equals("Ada") && field.getPromptText().equals("Your name"),
                "invalid TextField setters preserve text and prompt");
        require(field.fxNode() instanceof javafx.scene.control.TextField && field.fxNode().isFocusTraversable(),
                "TextField retains an editable native control and focus traversal");
        field.setText("");
        field.setPromptText("");
        require(field.getText().equals("") && field.getPromptText().equals(""), "empty text and prompt are supported");
        Label label = new Label("Count: 0");
        Button add = new Button("Add");
        int[] count = {0};
        add.onClick(() -> count[0] += 100);
        add.onClick(() -> { count[0]++; label.setText("Count: " + count[0]); });
        javafx.scene.control.Button nativeButton = (javafx.scene.control.Button) add.fxNode();
        require(nativeButton.isFocusTraversable(), "button retains native focus behavior");
        require(label.fxNode() instanceof javafx.scene.control.Label, "label is an ordinary native control");
        require(label.fxNode() == label.fxNode(), "bridge returns the same backing node");
        nativeButton.fire();
        require(count[0] == 1 && label.getText().equals("Count: 1"), "new callback replaces old callback");
        expectNull(() -> add.onClick(null));
        nativeButton.fire();
        require(count[0] == 2, "invalid callback preserves current callback");
        add.setText("Increase");
        expectNull(() -> add.setText(null));
        expectNull(() -> label.setText(null));
        require(add.getText().equals("Increase") && label.getText().equals("Count: 2"), "invalid text preserves content");
        add.setEnabled(false);
        nativeButton.fire();
        require(count[0] == 2 && add.getText().equals("Increase"), "disabled button blocks activation and preserves text/action");
        add.setEnabled(true);
        nativeButton.fire();
        require(count[0] == 3 && label.getText().equals("Count: 3"), "re-enabled button retains its action");
        Button reset = new Button("Reset");
        reset.onClick(() -> { count[0] = 0; label.setText("Count: 0"); });
        for (int i = 0; i < 3; i++) {
            nativeButton.fire();
            ((javafx.scene.control.Button) reset.fxNode()).fire();
            require(count[0] == 0 && label.getText().equals("Count: 0"), "counter can reset repeatedly");
        }
        Column column = new Column(label, add, reset);
        require(column.getSpacing() == 8 && ((VBox) column.fxNode()).getChildren().size() == 3,
                "default spacing and child order");
        require(((VBox) column.fxNode()).getChildren().get(1) == add.fxNode(), "column preserves supplied order");
        for (Element element : new Element[] {new Label("Ready"), new Button("Ready"), new TextField(), new Column()}) {
            require(!element.fxNode().isDisabled(), "elements start enabled");
            element.setEnabled(false);
            require(element.fxNode().isDisabled(), "each element inherits disabled state");
            element.setEnabled(true);
            require(!element.fxNode().isDisabled(), "each element can be re-enabled");
        }
        column.setEnabled(false);
        add.setEnabled(true);
        require(label.fxNode().isDisabled() && add.fxNode().isDisabled(), "disabled column disables its children");
        column.setEnabled(true);
        require(!label.fxNode().isDisabled() && !add.fxNode().isDisabled(), "re-enabled column restores children");
        add.setEnabled(false);
        column.setEnabled(false);
        column.setEnabled(true);
        require(add.fxNode().isDisabled() && !label.fxNode().isDisabled(), "parent re-enable preserves a child's separate disabled state");
        add.setEnabled(true);
        column.setSpacing(0);
        column.setSpacing(12.5);
        for (double bad : new double[] {-1, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            expectIllegal(() -> column.setSpacing(bad));
            require(column.getSpacing() == 12.5, "invalid spacing preserves previous value");
            Label fresh = new Label("Still unowned");
            expectIllegal(() -> new Column(bad, fresh));
            require(fresh.fxNode().getParent() == null, "invalid constructor spacing takes no ownership");
        }
        Label fresh = new Label("Fresh");
        expectNull(() -> new Column((Element[]) null));
        expectNull(() -> new Column(fresh, null));
        expectIllegal(() -> new Column(fresh, fresh));
        expectIllegal(() -> new Column(fresh, new Bridge(fresh.fxNode())));
        expectIllegal(() -> new Column(fresh, label));
        require(fresh.fxNode().getParent() == null && label.fxNode().getParent() == column.fxNode(),
                "all child validation finishes before ownership changes");
        VBox sceneRoot = new VBox();
        new Scene(sceneRoot);
        expectIllegal(() -> new Column(new Bridge(sceneRoot)));
        require(new Column().getSpacing() == 8, "empty column is supported");
        Label left = new Label("Left"), right = new Label("Right");
        Row row = new Row(left, right);
        require(row.getSpacing() == 8 && ((HBox) row.fxNode()).getChildren().get(0) == left.fxNode()
                && ((HBox) row.fxNode()).getChildren().get(1) == right.fxNode(), "Row default spacing and horizontal child order");
        row.setSpacing(0); row.setSpacing(12.5);
        for (double bad : new double[] {-1, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            expectIllegal(() -> row.setSpacing(bad));
            Label untouched = new Label("Untouched");
            expectIllegal(() -> new Row(bad, untouched));
            require(row.getSpacing() == 12.5 && untouched.fxNode().getParent() == null, "Row invalid spacing is atomic");
        }
        Label untouched = new Label("Untouched");
        expectNull(() -> new Row((Element[]) null));
        expectNull(() -> new Row(untouched, null));
        expectIllegal(() -> new Row(untouched, untouched));
        expectIllegal(() -> new Row(untouched, left));
        require(untouched.fxNode().getParent() == null && left.fxNode().getParent() == row.fxNode(), "Row ownership validation precedes attachment");
        row.setEnabled(false);
        require(left.fxNode().isDisabled(), "Row inherits parent availability behavior");
        row.setEnabled(true);
        require(!left.fxNode().isDisabled() && new Row().getSpacing() == 8, "Row re-enable and empty row");
    }

    private static void verifyApp() {
        Label label = new Label("A Zero app");
        Column column = new Column(label, new Button("Native button"));
        App app = new App() {
            @Override public void settings() { size(200, 150); }
            @Override public void setup() { show(column); }
        };
        expectState(() -> app.show(column));
        Stage stage = new Stage();
        app.start(stage);
        BorderPane root = (BorderPane) stage.getScene().getRoot();
        require(root.getCenter() == column.fxNode(), "App.show accepts Zero components");
        javafx.scene.control.Label legacy = new javafx.scene.control.Label("Legacy JavaFX");
        app.show(legacy);
        require(root.getCenter() == legacy && column.fxNode().getParent() == null, "legacy show remains available");
        app.show(column);
        app.show(column);
        expectNull(() -> app.show((Element) null));
        require(root.getCenter() == column.fxNode(), "reused component survives show and invalid replacement");
        app.stop();
        stage.close();
    }

    private static void verifyColors() {
        require(Color.WHITE.fxColor().equals(javafx.scene.paint.Color.WHITE), "white constant");
        require(Color.BLACK.fxColor().equals(javafx.scene.paint.Color.BLACK), "black constant");
        require(Color.BLUE.fxColor().equals(javafx.scene.paint.Color.BLUE), "blue constant");
        require(Color.GOLD.fxColor().equals(javafx.scene.paint.Color.GOLD), "gold constant");
        require(Color.rgb(17, 99, 203).fxColor().equals(javafx.scene.paint.Color.rgb(17, 99, 203)), "native RGB channels");
        for (int bad : new int[] {-1, 256}) {
            expectIllegal(() -> Color.rgb(bad, 0, 0));
            expectIllegal(() -> Color.rgb(0, bad, 0));
            expectIllegal(() -> Color.rgb(0, 0, bad));
        }
    }

    @Override public void update(double seconds) {
        try {
            updates++;
            score++;
            scoreLabel.setText("Score: " + score);
            if (phase == 0) {
                canvas().getScene().getWindow().requestFocus();
                canvas().requestFocus();
            } else if (phase == 1) {
                if (!NativeFocus.await(canvas(), phaseStarted, "UI check canvas focus")) return;
                WritableImage pixels = canvas().snapshot(null, null);
                require(pixels.getPixelReader().getColor(2, 2).equals(javafx.scene.paint.Color.WHITE), "Zero background pixels");
                require(pixels.getPixelReader().getColor(15, 15).equals(javafx.scene.paint.Color.rgb(17, 99, 203)), "Zero fill pixels");
                expectNull(() -> background((Color) null));
                expectNull(() -> fill((Color) null));
                expectNull(() -> stroke((Color) null));
                key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.SPACE);
                require(keyDown(KeyCode.SPACE), "canvas owns game input with HUD mounted");
                reset.fxNode().requestFocus();
            } else if (phase == 2) {
                if (!NativeFocus.await(reset.fxNode(), phaseStarted, "Zero button focus")) return;
                require(!keyDown(KeyCode.SPACE), "control focus clears held game keys");
                int before = resets;
                key(reset.fxNode(), KeyEvent.KEY_PRESSED, KeyCode.SPACE);
                key(reset.fxNode(), KeyEvent.KEY_RELEASED, KeyCode.SPACE);
                require(resets == before + 1 && score == 0, "native keyboard activation invokes Zero callback");
                require(!keyDown(KeyCode.SPACE), "button keyboard input stays out of game input");
            } else if (phase == 3) {
                name.fxNode().requestFocus();
            } else if (phase == 4) {
                if (!NativeFocus.await(name.fxNode(), phaseStarted, "Zero text field focus")) return;
                for (String letter : new String[] {"S", "a", "m"}) {
                    Event.fireEvent(name.fxNode(), new KeyEvent(KeyEvent.KEY_TYPED, letter, letter, KeyCode.UNDEFINED,
                            false, false, false, false));
                }
                require(name.getText().equals("Sam"), "native typing changes Zero text field text");
                require(!keyDown(KeyCode.A), "text input stays out of gameplay input");
                key(name.fxNode(), KeyEvent.KEY_PRESSED, KeyCode.TAB);
                key(name.fxNode(), KeyEvent.KEY_RELEASED, KeyCode.TAB);
            } else if (phase == 5) {
                if (!NativeFocus.await(greet.fxNode(), phaseStarted, "Tab from text field to Zero button")) return;
                key(greet.fxNode(), KeyEvent.KEY_PRESSED, KeyCode.SPACE);
                key(greet.fxNode(), KeyEvent.KEY_RELEASED, KeyCode.SPACE);
                require(greeting.getText().equals("Hello, Sam!"), "keyboard button callback reads typed text");
                name.setText("Ada");
                ((javafx.scene.control.Button) greet.fxNode()).fire();
                require(greeting.getText().equals("Hello, Ada!"), "button reads the latest programmatic text");
            } else if (phase == 6) {
                name.setEnabled(false);
                greet.setEnabled(false);
                Event.fireEvent(name.fxNode(), new KeyEvent(KeyEvent.KEY_TYPED, "X", "X", KeyCode.UNDEFINED,
                        false, false, false, false));
                key(greet.fxNode(), KeyEvent.KEY_PRESSED, KeyCode.SPACE);
                key(greet.fxNode(), KeyEvent.KEY_RELEASED, KeyCode.SPACE);
                require(name.getText().equals("Ada") && greeting.getText().equals("Hello, Ada!") && greetings == 2,
                        "disabled field blocks typing and disabled button blocks keyboard activation");
                name.setEnabled(true);
                greet.setEnabled(true);
                name.fxNode().requestFocus();
            } else if (phase == 7) {
                if (!NativeFocus.await(name.fxNode(), phaseStarted, "re-enabled Zero text field focus")) return;
                Event.fireEvent(name.fxNode(), new KeyEvent(KeyEvent.KEY_TYPED, "!", "!", KeyCode.UNDEFINED,
                        false, false, false, false));
                ((javafx.scene.control.Button) greet.fxNode()).fire();
                require(name.getText().contains("!") && greeting.getText().equals("Hello, " + name.getText() + "!") && greetings == 3,
                        "re-enabled field accepts typing and button retains its callback");
            } else if (phase == 8) {
                require(updates >= 6 && score > 0, "game update continues while a control has focus");
                require(layout().getBottom() == hud.fxNode() && layout().getCenter() == canvas(), "HUD and canvas remain mounted");
                System.out.println("ZERO_UI_OK inherited setEnabled, disabled input/button blocking and reuse, TextField five signatures, typed greeting, prompt/errors, tab/button focus, text/callback replacement, atomic composition, App show, colors and live game frames");
                stop();
                Platform.exit();
            }
            phase++;
            phaseStarted = System.nanoTime();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }

    @Override public void draw() {
        background(Color.WHITE);
        fill(Color.rgb(17, 99, 203)); rect(10, 10, 20, 20);
        stroke(Color.GOLD); outlineRect(40, 10, 20, 20);
        // Existing explicit JavaFX imports and calls retain their overloads.
        fill(javafx.scene.paint.Color.BLUE); rect(70, 10, 20, 20);
        stroke(javafx.scene.paint.Color.BLACK);
    }

    private static final class Bridge extends Element {
        Bridge(Node node) { super(node); }
    }
    private static void key(Node target, javafx.event.EventType<KeyEvent> type, KeyCode code) {
        Event.fireEvent(target, new KeyEvent(type, "", "", code, false, false, false, false));
    }
    private static void expectNull(Runnable action) {
        try { action.run(); throw new AssertionError("Expected null argument rejection"); }
        catch (NullPointerException expected) { require(expected.getMessage() != null, "useful null error"); }
    }
    private static void expectIllegal(Runnable action) {
        try { action.run(); throw new AssertionError("Expected invalid argument rejection"); }
        catch (IllegalArgumentException expected) { require(expected.getMessage() != null, "useful argument error"); }
    }
    private static void expectState(Runnable action) {
        try { action.run(); throw new AssertionError("Expected lifecycle rejection"); }
        catch (IllegalStateException expected) { require(expected.getMessage().contains("setup"), "useful lifecycle error"); }
    }
    private static void require(boolean value, String description) {
        if (!value) throw new AssertionError(description);
    }
    public static void main(String[] args) { launch(args); }
}
