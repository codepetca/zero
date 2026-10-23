package zero;

import javafx.animation.AnimationTimer;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.event.Event;
import javafx.scene.Node;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyEvent;
import javafx.scene.input.MouseButton;
import javafx.scene.input.MouseEvent;
import javafx.scene.input.PickResult;
import javafx.scene.layout.BorderPane;
import javafx.stage.Stage;
import zero.ui.Column;
import zero.ui.Label;

/** Finite native navigation, pause, frame transaction and failure checks. */
public final class NavigationCheck extends Application {
    private int phase, ticks, entered, savedUpdates, savedDraws, failures;
    private GameProbe game;
    private GameProbe stopped;
    private Stage gameStage, stoppedStage;
    private long focusStarted;
    private Thread.UncaughtExceptionHandler previousHandler;

    @Override public void start(Stage stage) {
        Platform.setImplicitExit(false);
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(20_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_NAVIGATION_TIMEOUT phase=" + phase); System.exit(1);
        }, "zero-navigation-deadline");
        watchdog.setDaemon(true); watchdog.start();
        try {
            verifyUiApp();
            GameProbe early = new GameProbe();
            expectState(early::showGame); expectState(early::pause);
            expectState(early::resume); expectState(() -> early.isPaused());
            game = new GameProbe(); gameStage = stage; game.start(stage);
            require(root(gameStage).getCenter() == game.title.fxNode(), "title displayed during setup");
            require(stage.getScene().getWidth() >= 264 && stage.getScene().getHeight() > 174,
                    "title reserves fixed canvas, padding and HUD space");
            previousHandler = Thread.currentThread().getUncaughtExceptionHandler();
            Thread.currentThread().setUncaughtExceptionHandler((thread, failure) -> {
                if (failure instanceof IllegalStateException && "Expected navigation frame failure".equals(failure.getMessage())) failures++;
                else { failure.printStackTrace(); System.exit(1); }
            });
            new AnimationTimer() {
                @Override public void handle(long now) {
                    try { tick(); }
                    catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
                }
            }.start();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }

    private void tick() {
        ticks++;
        if (phase == 0 && waited()) {
            require(game.updates == 0 && game.draws == 0, "title suppresses first update and draw");
            game.show(game.menuA);
            require(root(gameStage).getCenter() == game.menuA.fxNode(), "UI callback navigation commits while game suspended");
            game.expectZero = true; game.showGame(); next();
        } else if (phase == 1 && game.updates >= 2) {
            if (focusStarted == 0) focusStarted = System.nanoTime();
            if (!NativeFocus.await(game.canvas(), focusStarted, "navigation canvas focus")) return;
            key(game.canvas(), KeyEvent.KEY_PRESSED);
            mouse(game.canvas());
            require(game.keyDown(KeyCode.SPACE) && game.mouseDown(MouseButton.PRIMARY), "game accepts canvas input");
            double x = game.mouseX(), y = game.mouseY();
            game.pause();
            require(game.isPaused(), "pause flag set"); cleanInput(game);
            require(game.mouseX() == x && game.mouseY() == y, "pause keeps pointer coordinates");
            savedUpdates = game.updates; savedDraws = game.draws; next();
        } else if (phase == 2 && waited()) {
            require(game.updates == savedUpdates && game.draws > savedDraws, "pause freezes updates while drawing continues");
            key(game.canvas(), KeyEvent.KEY_PRESSED); mouse(game.canvas()); cleanInput(game);
            game.show(game.menuA);
            savedDraws = game.draws; next();
        } else if (phase == 3 && waited()) {
            require(game.updates == savedUpdates && game.draws == savedDraws, "menu suppresses paused drawing too");
            game.showGame();
            require(game.isPaused() && root(gameStage).getCenter() == game.layout(), "showGame preserves explicit pause and retained layout");
            next();
        } else if (phase == 4 && waited()) {
            require(game.updates == savedUpdates && game.draws > savedDraws, "paused return draws but never updates");
            game.expectZero = true; game.resume(); cleanInput(game);
            require(!game.isPaused(), "resume clears explicit pause"); next();
        } else if (phase == 5 && game.updates > savedUpdates + 1) {
            game.mode = 1; next();
        } else if (phase == 6 && root(gameStage).getCenter() == game.menuB.fxNode()) {
            require(game.deferredDraws == 1, "update navigation waits until current draw and last request wins");
            cleanInput(game);
            game.show(game.menuA);
            require(root(gameStage).getCenter() == game.menuA.fxNode(), "menu-to-menu callback is immediate");
            savedUpdates = game.updates;
            game.expectZero = true; game.showGame(); next();
        } else if (phase == 7 && game.updates > savedUpdates) {
            game.mode = 2; next();
        } else if (phase == 8 && root(gameStage).getCenter() == game.menuA.fxNode()) {
            require(game.deferredDraws == 2, "draw navigation also waits until draw returns");
            require(game.layout().getBottom() == game.hud.fxNode(), "same HUD survives menu/game cycles");
            savedUpdates = game.updates;
            game.expectZero = true; game.showGame(); next();
        } else if (phase == 9 && game.updates > savedUpdates) {
            game.show(game.title); game.expectZero = true; game.showGame();
            game.mode = 3; next();
        } else if (phase == 10 && failures == 1) {
            savedUpdates = game.updates; savedDraws = game.draws; next();
        } else if (phase == 11 && waited()) {
            require(game.updates == savedUpdates && game.draws == savedDraws, "failed frame stops its only timer");
            require(root(gameStage).getCenter() == game.layout(), "failed frame discards queued view");
            require(!game.windowFocused(), "failure cleanup clears owned window state");
            cleanInput(game); expectState(game::showGame); game.stop(); game.stop(); gameStage.close();
            stopped = new GameProbe(); stoppedStage = new Stage(); stopped.start(stoppedStage);
            stopped.mode = 4; stopped.showGame(); next();
        } else if (phase == 12 && waited()) {
            require(stopped.updates == 1 && stopped.draws == 0, "stop during update prevents later draw and frames");
            require(root(stoppedStage).getCenter() == stopped.layout(), "stop discards pending navigation");
            stopped.stop(); stoppedStage.close();
            Thread.currentThread().setUncaughtExceptionHandler(previousHandler);
            System.out.println("ZERO_NAVIGATION_OK immediate UI, title sizing/suspension, retained game/HUD, pause drawing, zero delta/input reset, deferred navigation, failure/stop cleanup");
            Platform.exit();
        }
    }

    private static void verifyUiApp() {
        Stage stage = new Stage();
        Label first = new Label("First"); Label second = new Label("Second");
        App ui = new App() { @Override public void setup() { show(first); } };
        ui.start(stage);
        require(root(stage).getCenter() == first.fxNode(), "UI-only setup show commits immediately");
        ui.show(second);
        require(root(stage).getCenter() == second.fxNode(), "UI-only callback show commits immediately");
        ui.stop(); stage.close();
    }

    private static final class GameProbe extends GameApp {
        final Label title = new Label("Title");
        final Label menuA = new Label("Menu A");
        final Label menuB = new Label("Menu B");
        final Column hud = new Column(new Label("Retained HUD"));
        int updates, draws, mode, deferredDraws;
        boolean expectZero, queuedInUpdate;
        @Override public void settings() { size(240, 150); padding(12); }
        @Override public void setup() { controls(hud); show(title); }
        @Override public void update(double seconds) {
            updates++;
            if (expectZero) { require(seconds == 0, "first resumed or navigated update has zero delta"); expectZero = false; }
            if (mode == 1) {
                show(menuA); show(menuB); queuedInUpdate = true; mode = 0;
                require(root((Stage) canvas().getScene().getWindow()).getCenter() == layout(), "update still owns current game view");
            } else if (mode == 3) {
                show(menuA);
                throw new IllegalStateException("Expected navigation frame failure");
            } else if (mode == 4) { show(menuA); stop(); }
        }
        @Override public void draw() {
            draws++; background(zero.Color.WHITE);
            if (queuedInUpdate) {
                require(canvas().getScene() != null, "draw finishes on current attached canvas");
                queuedInUpdate = false; deferredDraws++;
            }
            if (mode == 2) {
                show(menuA); mode = 0;
                require(canvas().getScene() != null, "draw-requested view remains deferred");
                deferredDraws++;
            }
        }
    }
    private boolean waited() { return ticks - entered >= 4; }
    private void next() { phase++; entered = ticks; }
    private static BorderPane root(Stage stage) { return (BorderPane) stage.getScene().getRoot(); }
    private static void cleanInput(GameApp app) {
        require(!app.keyDown(KeyCode.SPACE) && !app.keyPressed(KeyCode.SPACE)
                && !app.mouseDown(MouseButton.PRIMARY) && !app.mousePressed(MouseButton.PRIMARY), "held and edge input cleared");
    }
    private static void key(Node node, javafx.event.EventType<KeyEvent> type) {
        Event.fireEvent(node, new KeyEvent(type, "", "", KeyCode.SPACE, false, false, false, false));
    }
    private static void mouse(Node node) {
        Event.fireEvent(node, new MouseEvent(MouseEvent.MOUSE_PRESSED, 20, 20, 20, 20, MouseButton.PRIMARY, 1,
                false, false, false, false, true, false, false, false, false, false, new PickResult(node, 20, 20)));
    }
    private static void expectState(Runnable action) {
        try { action.run(); throw new AssertionError("Expected startup/stop guard"); }
        catch (IllegalStateException expected) { require(expected.getMessage().contains("setup"), "useful startup/stop guard"); }
    }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) { launch(args); }
}
