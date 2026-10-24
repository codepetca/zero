import java.lang.reflect.Field;
import javafx.animation.AnimationTimer;
import javafx.application.Application;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.stage.Stage;

/** Copied to GameCheck.java by the finite native example runner. */
public class GameCheck extends Application {
    private Main app;

    @Override public void start(Stage stage) {
        boolean passed = false;
        try {
            playerChecks();
            app = new Main();
            app.start(stage);
            AnimationTimer timer = (AnimationTimer) get(app, "timer");
            timer.stop(); // Dispatch deliberate real frame callbacks without pulse races.
            ((zero.Sound) get(app, "chime")).setMuted(true);
            require(state().equals("READY"), "Title waits for Play");
            button(stage.getScene().getRoot(), "Play Sky Steps").fire();
            require(state().equals("PLAYING"), "Actual Play button starts game");
            Button restart = button(stage.getScene().getRoot(), "Restart");
            Button pause = button(stage.getScene().getRoot(), "Pause");
            Player player = (Player) get(app, "player");
            player.setPosition(155, 389);
            app.update(0);
            app.update(0);
            require((int) get(app, "collected") == 1, "One coin scores exactly once");
            require(label("score").startsWith("Coins: 1 / 4"), "Coin updates live HUD");
            player.setPosition(748, 320);
            app.update(0);
            require(state().equals("PLAYING"), "Exit stays locked before four coins");
            for (Coin coin : (Coin[]) get(app, "coins")) {
                player.setPosition((double) get(coin, "x"), (double) get(coin, "y"));
                app.update(0);
            }
            require((int) get(app, "collected") == 4, "Every coin scores once");
            require(label("score").startsWith("Coins: 4 / 4"), "Full score appears in HUD");
            player.setPosition(748, 320);
            app.update(0);
            require(state().equals("WON") && pause.isDisabled(), "Unlocked exit wins");
            require(label("message").contains("reached the exit"), "Win feedback");
            app.update(0.1);
            require(player.y() == 320, "Finished game stops moving");
            app.draw();
            restart.fire();
            checkReset();
            player = (Player) get(app, "player");
            player.setPosition(250, 600);
            app.update(0.05);
            require(state().equals("LOST") && pause.isDisabled(), "Falling loses");
            require(label("message").contains("Splash"), "Loss offers retry");
            app.draw();
            restart.fire();
            checkReset();

            player = (Player) get(app, "player");
            player.setPosition(155, 389);
            app.update(0);
            set(app, "elapsed", 1.25);
            app.update(0);
            String scoreBeforePause = label("score");
            pause.fire();
            require(app.isPaused() && pause.getText().equals("Resume"), "Pause button changes state");
            timer.handle(1_000_000_000L);
            timer.handle(1_100_000_000L);
            require(player.x() == 155 && player.y() == 389, "Paused real frames retain position");
            require((double) get(app, "elapsed") == 1.25, "Paused frames freeze clock");
            require(label("score").equals(scoreBeforePause), "Pause retains HUD and coins");
            pause.fire();
            require(!app.isPaused() && pause.getText().equals("Pause"), "Resume button continues");
            timer.handle(1_200_000_000L);
            timer.handle(1_300_000_000L);
            require(Math.abs((double) get(app, "elapsed") - 1.35) < 0.00001, "Resumed real frame advances clock");
            require((int) get(app, "collected") == 1, "Resume retains collected coins");
            pause.fire();
            restart.fire();
            checkReset();
            require(!app.isPaused() && pause.getText().equals("Pause"), "Restart clears pause");
            passed = true;
        } catch (Throwable failure) {
            failure.printStackTrace();
        } finally {
            try { if (app != null) app.stop(); }
            catch (Throwable failure) { failure.printStackTrace(); passed = false; }
            stage.close();
            javafx.application.Platform.exit();
        }
        if (passed) System.out.println("ZERO_BASIC_GAME_OK");
        else System.exit(1);
    }

    private void playerChecks() throws Exception {
        Platform[] platforms = {new Platform(0, 300, 200, 20), new Platform(0, 250, 200, 12)};
        Player jumper = new Player(60, 282, 800, platforms);
        Player reference = new Player(60, 282, 800, platforms);
        jumper.update(0.01);
        reference.update(0.01);
        require((boolean) get(jumper, "grounded") && jumper.y() == 282, "Player settles on floor");
        jumper.control(0, true); reference.control(0, true);
        jumper.update(0.05); reference.update(0.05);
        require(jumper.y() < 282 && !(boolean) get(jumper, "grounded"), "Grounded jump rises");
        jumper.control(0, true); reference.control(0, false);
        jumper.update(0.05); reference.update(0.05);
        require(jumper.y() == reference.y(), "Jump request in midair cannot jump again");
        for (int frame = 0; frame < 15; frame++) { jumper.control(0, false); jumper.update(0.01); }
        require(jumper.y() + 18 < 250 && !(boolean) get(jumper, "grounded"), "Rising player passes through platform");
        for (int frame = 0; frame < 80; frame++) jumper.update(0.01);
        require(jumper.y() == 232 && (boolean) get(jumper, "grounded"), "Descending player lands and stays on top");
        Player fast = new Player(70, 160, 800, new Platform[] {new Platform(0, 220, 200, 20)});
        set(fast, "velocityY", 700.0);
        fast.update(0.1);
        require(fast.y() == 202 && (boolean) get(fast, "grounded"), "Slow frame catches crossed platform top");
        Player walker = new Player(180, 282, 800, new Platform[] {new Platform(0, 300, 200, 20)});
        walker.update(0.01);
        walker.control(1, false);
        walker.update(0.1); walker.update(0.1);
        require(!(boolean) get(walker, "grounded") && walker.y() > 282, "Walking off edge begins falling");
        walker.control(0, false);
        for (int frame = 0; frame < 10; frame++) walker.update(0.1);
        require(walker.y() > 600, "Unsupported player falls below screen");
    }

    private void checkReset() throws Exception {
        Player player = (Player) get(app, "player");
        require(state().equals("PLAYING") && player.x() == 60 && player.y() == 402, "Restart restores player and state");
        require((double) get(player, "velocityY") == 0 && (double) get(app, "elapsed") == 0, "Restart clears velocity and time");
        require((int) get(app, "collected") == 0 && label("score").equals("Coins: 0 / 4     Time: 0 s"), "Restart resets HUD");
        for (Coin coin : (Coin[]) get(app, "coins")) require(!coin.isCollected(), "Restart restores every coin");
        require(!((javafx.scene.control.Button) ((zero.ui.Button) get(app, "pauseButton")).fxNode()).isDisabled(), "Restart enables Pause");
    }

    private String state() throws Exception { return get(app, "state").toString(); }
    private String label(String field) throws Exception { return ((zero.ui.Label) get(app, field)).getText(); }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static Field field(Object object, String name) throws Exception {
        for (Class<?> type = object.getClass(); type != null; type = type.getSuperclass()) {
            try { Field result = type.getDeclaredField(name); result.setAccessible(true); return result; }
            catch (NoSuchFieldException ignored) { }
        }
        throw new NoSuchFieldException(name);
    }
    private static Object get(Object object, String name) throws Exception { return field(object, name).get(object); }
    private static void set(Object object, String name, Object value) throws Exception { field(object, name).set(object, value); }
    private static Button button(Node node, String text) {
        if (node instanceof Button candidate && candidate.getText().equals(text)) return candidate;
        if (node instanceof Parent parent) for (Node child : parent.getChildrenUnmodifiable()) {
            Button found = button(child, text); if (found != null) return found;
        }
        return null;
    }
    public static void main(String[] args) { launch(args); }
}
