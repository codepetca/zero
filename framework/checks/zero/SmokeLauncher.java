package zero;

import javafx.application.Platform;
import javafx.event.Event;
import javafx.scene.control.Label;
import javafx.scene.control.Button;
import javafx.scene.control.TextField;
import javafx.scene.image.WritableImage;
import javafx.scene.input.*;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.stage.Stage;

/** Finite contributor GUI check, selected only with -Psmoke. */
public final class SmokeLauncher extends GameApp {
    private int phase;
    private boolean setupRan;
    private TextField input;
    private FailingGame failing;
    private Stage failureStage;
    private int observedErrors;
    private Stage uiStage;
    private App uiApp;
    private TextField uiField;
    private double initialFieldWidth;
    private Thread.UncaughtExceptionHandler previousHandler;

    @Override public void settings() { size(120, 100); title("Zero verification (closes automatically)"); }
    @Override public void setup() {
        setupRan = true;
        input = new TextField();
        layout().setBottom(new VBox(input, new Button("Restart")));
        require(width() == 120 && height() == 100, "settings before setup");
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(10_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_SMOKE_TIMEOUT phase=" + phase);
            System.exit(1);
        }, "zero-smoke-deadline");
        watchdog.setDaemon(true);
        watchdog.start();
    }
    @Override public void update(double seconds) {
        try {
            require(setupRan, "setup before update");
            require(seconds >= 0 && seconds <= 0.1, "bounded frame time");
            if (phase == 1) {
                WritableImage pixels = canvas().snapshot(null, null);
                require(pixels.getPixelReader().getColor(1, 1).equals(Color.WHITE), "background clears canvas");
                require(pixels.getPixelReader().getColor(20, 20).equals(Color.RED), "rectangle pixels");
                require(pixels.getPixelReader().getColor(70, 50).equals(Color.BLUE), "circle centre pixels");
                canvas().getScene().getWindow().requestFocus();
                canvas().requestFocus();
            } else if (phase == 2) {
                // Native window activation may arrive after the first animation pulses.
                if (!canvas().getScene().getWindow().isFocused()) {
                    canvas().getScene().getWindow().requestFocus();
                    canvas().requestFocus();
                    phase = 1;
                    return; // The existing watchdog bounds this wait.
                }
                require(canvas().isFocused(), "canvas focus");
                for (KeyCode arrow : new KeyCode[] {KeyCode.DOWN, KeyCode.UP, KeyCode.LEFT, KeyCode.RIGHT}) {
                    key(canvas(), KeyEvent.KEY_PRESSED, arrow);
                    require(canvas().isFocused(), "arrow retains canvas focus: " + arrow);
                    require(keyDown(arrow), "canvas owns held arrow: " + arrow);
                    key(canvas(), KeyEvent.KEY_RELEASED, arrow);
                    require(!keyDown(arrow), "arrow release clears input: " + arrow);
                }
                key(canvas(), KeyEvent.KEY_PRESSED, KeyCode.TAB);
                require(!canvas().isFocused(), "Tab still reaches native controls");
                canvas().requestFocus();
                key(canvas(), KeyEvent.KEY_PRESSED);
                require(keyDown(KeyCode.SPACE), "held key press");
                key(canvas(), KeyEvent.KEY_RELEASED);
                require(!keyDown(KeyCode.SPACE), "held key release");
                key(canvas(), KeyEvent.KEY_PRESSED);
                mouse(canvas(), MouseEvent.MOUSE_PRESSED, MouseButton.PRIMARY);
                require(mouseDown(MouseButton.PRIMARY), "canvas owns mouse press");
                input.requestFocus();
            } else if (phase == 3) {
                require(input.isFocused(), "native TextField focus");
                require(!keyDown(KeyCode.SPACE) && !mouseDown(MouseButton.PRIMARY), "focus transfer clears held inputs");
                key(input, KeyEvent.KEY_PRESSED);
                require(!keyDown(KeyCode.SPACE), "typing does not drive game keys");
                mouse(input, MouseEvent.MOUSE_PRESSED, MouseButton.PRIMARY);
                require(!mouseDown(MouseButton.PRIMARY), "control click does not drive game mouse");
                input.setText("ordinary JavaFX input");
                require(input.getText().equals("ordinary JavaFX input"), "native control usable");
                input.positionCaret(0);
                key(input, KeyEvent.KEY_PRESSED, KeyCode.RIGHT);
                require(input.isFocused() && input.getCaretPosition() == 1, "native TextField arrows move caret");
                require(!keyDown(KeyCode.RIGHT), "native control arrow does not drive canvas");
                mouse(canvas(), MouseEvent.MOUSE_PRESSED, MouseButton.PRIMARY);
                require(mouseDown(MouseButton.PRIMARY), "canvas click reacquires input");
                mouse(input, MouseEvent.MOUSE_RELEASED, MouseButton.PRIMARY);
                require(!mouseDown(MouseButton.PRIMARY), "release outside canvas clears button");
                verifyApp();
                verifyErrors();
                previousHandler = Thread.currentThread().getUncaughtExceptionHandler();
                Thread.currentThread().setUncaughtExceptionHandler((thread, error) -> {
                    if (error instanceof IllegalStateException && "Expected frame failure".equals(error.getMessage())) observedErrors++;
                    else { error.printStackTrace(); System.exit(1); }
                });
                failing = new FailingGame();
                failureStage = new Stage();
                failing.start(failureStage);
            } else if (phase == 6) {
                // Window-manager resize/configure events can outlast a few animation pulses.
                if (uiStage.getScene().getWidth() <= 300 || uiField.getWidth() <= initialFieldWidth + 50) {
                    phase = 5;
                    return; // Require actual scene/layout growth before the watchdog expires.
                }
                require(uiStage.getScene().getWidth() > 300, "UI scene resizes");
                require(uiField.getWidth() > initialFieldWidth + 50, "native layout grows with window");
                uiApp.stop(); uiStage.close();
            } else if (phase == 10) {
                require(observedErrors == 1 && failing.updates == 1, "failed frame stops timer after one error");
                require(!failing.mouseDown(MouseButton.PRIMARY), "failed frame clears owned input without explicit stop");
                failing.stop();
                failureStage.close();
                Thread.currentThread().setUncaughtExceptionHandler(previousHandler);
                stop();
                require(!keyDown(KeyCode.SPACE) && !mouseDown(MouseButton.PRIMARY), "stop clears input");
                System.out.println("ZERO_SMOKE_OK shared lifecycle, resize, pixels, canvas/control focus, releases, configuration/setup/frame errors, shutdown");
                Platform.exit();
            }
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }
    private void verifyApp() {
        uiStage = new Stage();
        uiApp = new App() {
            private boolean configured;
            @Override public void settings() { configured = true; size(240, 160); title("UI lifecycle check"); padding(12); }
            @Override public void setup() {
                require(configured, "UI settings before setup");
                uiField = new TextField();
                show(new VBox(12, new Label("A resizable ordinary UI"), uiField));
            }
        };
        uiApp.start(uiStage);
        require(uiStage.isResizable(), "UI window resizable");
        require(uiStage.getScene().getWidth() == 240, "initial UI content width");
        var root = (javafx.scene.layout.BorderPane) uiStage.getScene().getRoot();
        require(root.getPadding().equals(new javafx.geometry.Insets(12)), "uniform UI edge padding");
        require(root.getCenter().getLayoutX() == 12 && root.getCenter().getLayoutY() == 12,
                "UI content is inset from the window edges");
        require(uiField.getWidth() == 216, "padding reduces usable UI width without widening the window");
        var replacement = new VBox(12, new Label("Replacement screen"), uiField);
        uiApp.show(replacement);
        root.applyCss();
        root.layout();
        require(replacement.getLayoutX() == 12 && replacement.getLayoutY() == 12,
                "padding survives replacing the screen");
        initialFieldWidth = uiField.getWidth();
        uiStage.setWidth(400);
        uiStage.setHeight(240); // Submit both native dimensions together, including on GTK.
        try { uiApp.size(10, 10); throw new AssertionError("late size accepted"); }
        catch (IllegalStateException expected) { require(expected.getMessage().contains("settings"), "useful size error"); }
        try { uiApp.padding(10); throw new AssertionError("late padding accepted"); }
        catch (IllegalStateException expected) { require(expected.getMessage().contains("settings"), "useful padding error"); }
    }
    private void verifyErrors() {
        for (double value : new double[] {-1, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            Stage paddingStage = new Stage();
            App invalidPadding = new App() { @Override public void settings() { padding(value); } };
            try { invalidPadding.start(paddingStage); throw new AssertionError("invalid padding accepted: " + value); }
            catch (IllegalArgumentException expected) { require(!paddingStage.isShowing(), "invalid padding leaves no window"); }
        }
        Stage invalidStage = new Stage();
        App invalid = new App() { @Override public void settings() { size(Double.NaN, 100); } };
        try { invalid.start(invalidStage); throw new AssertionError("invalid size accepted"); }
        catch (IllegalArgumentException expected) { require(!invalidStage.isShowing(), "invalid config leaves no window"); }
        Stage setupStage = new Stage();
        App badSetup = new App() { @Override public void setup() { throw new IllegalStateException("Expected setup failure"); } };
        try { badSetup.start(setupStage); throw new AssertionError("setup failure swallowed"); }
        catch (IllegalStateException expected) { require(!setupStage.isShowing(), "setup error closes window"); }
        try { new App() { }.show(new Label()); throw new AssertionError("early show accepted"); }
        catch (IllegalStateException expected) { require(expected.getMessage().contains("setup"), "useful show error"); }
    }
    private static final class FailingGame extends GameApp {
        private int updates;
        @Override public void settings() { size(40, 40); }
        @Override public void update(double seconds) {
            updates++;
            mouse(canvas(), MouseEvent.MOUSE_PRESSED, MouseButton.PRIMARY);
            require(mouseDown(MouseButton.PRIMARY), "failed frame starts with owned mouse input");
            throw new IllegalStateException("Expected frame failure");
        }
    }
    private static void key(javafx.scene.Node target, javafx.event.EventType<KeyEvent> type) {
        key(target, type, KeyCode.SPACE);
    }
    private static void key(javafx.scene.Node target, javafx.event.EventType<KeyEvent> type, KeyCode code) {
        Event.fireEvent(target, new KeyEvent(type, "", "", code, false, false, false, false));
    }
    private static void mouse(javafx.scene.Node target, javafx.event.EventType<MouseEvent> type, MouseButton button) {
        Event.fireEvent(target, new MouseEvent(type, 10, 10, 10, 10, button, 1,
                false, false, false, false, button == MouseButton.PRIMARY, false, false,
                false, false, false, new PickResult(target, 10, 10)));
    }
    @Override public void draw() {
        background(Color.WHITE);
        fill(Color.RED); rect(10, 10, 30, 30);
        fill(Color.BLUE); circle(70, 50, 20);
        phase++;
    }
    private static void require(boolean condition, String description) {
        if (!condition) throw new AssertionError(description);
    }
    public static void main(String[] args) { launch(args); }
}
