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
import javafx.stage.Stage;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Element;
import zero.ui.Label;

/** Finite native checks for Zero UI composition and live game controls. */
public final class UiCheck extends GameApp {
    private int phase, updates, score, resets;
    private long phaseStarted = System.nanoTime();
    private Label scoreLabel;
    private Button reset;
    private Column hud;

    @Override public void settings() { size(160, 100); title("Zero UI checks"); }

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
        hud = new Column(scoreLabel, reset);
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
            } else if (phase == 5) {
                require(updates >= 6 && score > 0, "game update continues while a control has focus");
                require(layout().getBottom() == hud.fxNode() && layout().getCenter() == canvas(), "HUD and canvas remain mounted");
                System.out.println("ZERO_UI_OK text/callback replacement, atomic composition, reuse, App show, colors, live game frames and native focus");
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
