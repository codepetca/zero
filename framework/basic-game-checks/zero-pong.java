import java.lang.reflect.Field;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.stage.Stage;

/** Finite native check; copied to GameCheck.java beside the actual game sources. */
public class GameCheck extends Application {
    @Override public void start(Stage stage) {
        Main app = new Main();
        int exitCode = 0;
        try {
            app.start(stage);
            Node root = stage.getScene().getRoot();
            require(hasText(root, "ZERO PONG"), "real title is visible");
            click(root, "Play");
            app.pause(); // All checks run synchronously on this thread; no timer races.
            require((Boolean) get(app, "playing"), "Play starts the match");
            require(hasText(root, "You 0 : 0 Computer"), "HUD starts at zero");

            Paddle player = (Paddle) get(app, "player");
            player.setDirection(-1);
            player.update(10);
            close(player.y(), 86 + player.height() / 2, "player top clamp");
            player.setDirection(1);
            player.update(10);
            close(player.y(), 438 - player.height() / 2, "player bottom clamp");
            Paddle computer = (Paddle) get(app, "computer");
            double oldY = computer.y();
            computer.aimAt(438);
            computer.update(0.1);
            close(computer.y() - oldY, 17.5, "computer has bounded speed");
            computer.aimAt(computer.y() + 5);
            oldY = computer.y();
            computer.update(0.1);
            close(computer.y(), oldY, "computer dead zone");

            Ball ball = new Ball(360, 262, 86, 438);
            ball.serve(-1);
            ball.update(0.4);
            close(ball.x(), 360, "serve waits before moving");
            ball.update(0.6);
            require(!ball.isServing(), "serve delay expires");
            ball.update(0.1);
            close(ball.x(), 331, "ball uses seconds and velocity");
            ball.setPosition(360, 90);
            set(ball, "velocityY", -200);
            ball.update(0.05);
            close(ball.y(), 94, "top wall keeps whole ball inside");
            require(number(ball, "velocityY") > 0, "top wall reflects downward");
            ball.setPosition(360, 434);
            set(ball, "velocityY", 200);
            ball.update(0.05);
            close(ball.y(), 430, "bottom wall keeps whole ball inside");
            require(number(ball, "velocityY") < 0, "bottom wall reflects upward");
            player.setPosition(42, 262);
            ball.setPosition(56, 286);
            set(ball, "velocityX", -290);
            ball.bounceOff(player, true);
            close(ball.x(), 57, "paddle separates ball from its face");
            close(number(ball, "velocityX"), 308, "paddle reverses horizontal velocity");
            close(number(ball, "velocityY"), 140, "off-centre hit changes outgoing angle");
            ball.bounceOff(player, true);
            close(number(ball, "velocityX"), 308, "same paddle cannot bounce ball twice");
            computer.setPosition(678, 262);
            ball.setPosition(664, 262);
            ball.bounceOff(computer, false);
            require(number(ball, "velocityX") < 0, "computer paddle returns ball left");

            point(app, true);
            require(number(app, "playerScore") == 1 && number(app, "computerScore") == 0,
                    "ball leaving right edge awards exactly one player point");
            require(((Ball) get(app, "ball")).isServing(), "point creates a delayed serve");
            app.resume();
            click(root, "Pause");
            require(app.isPaused() && number(app, "playerScore") == 1, "Pause preserves score");
            app.draw();
            click(root, "Resume");
            require(!app.isPaused() && number(app, "playerScore") == 1, "Resume preserves score");
            app.pause();
            for (int i = 0; i < 4; i++) point(app, true);
            require(!(Boolean) get(app, "playing") && hasText(root, "You win!"), "five points wins");
            require(findButton(root, "Pause").isDisabled(), "finished match disables Pause");
            point(app, true);
            close(number(app, "playerScore"), 5, "finished match cannot keep scoring");
            app.draw();
            click(root, "Restart");
            require(!app.isPaused() && (Boolean) get(app, "playing"), "Restart starts fresh play");
            close(number(app, "playerScore"), 0, "Restart clears player score");
            close(number(app, "computerScore"), 0, "Restart clears computer score");
            close(((Paddle) get(app, "player")).y(), 262, "Restart centres paddle");
            require(!findButton(root, "Pause").isDisabled(), "Restart re-enables Pause");
            app.pause();
            for (int i = 0; i < 5; i++) point(app, false);
            require(!(Boolean) get(app, "playing") && hasText(root, "Computer wins."), "five misses loses");
            app.draw();
            click(root, "Restart");
            require(hasText(root, "You 0 : 0 Computer"), "loss can also restart");
        } catch (Throwable failure) {
            failure.printStackTrace();
            exitCode = 1;
        } finally {
            try { app.stop(); } catch (Throwable failure) { failure.printStackTrace(); exitCode = 1; }
            Platform.exit();
        }
        if (exitCode != 0) System.exit(exitCode);
        System.out.println("ZERO_BASIC_GAME_OK");
    }

    private static void point(Main app, boolean playerPoint) throws Exception {
        Ball ball = (Ball) get(app, "ball");
        ball.setPosition(playerPoint ? 740 : -20, 262);
        set(ball, "serveDelay", 0);
        set(ball, "velocityX", playerPoint ? 290 : -290);
        app.update(1.0 / 120);
    }
    private static Object get(Object object, String name) throws Exception {
        Field field = object.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(object);
    }
    private static double number(Object object, String name) throws Exception { return ((Number) get(object, name)).doubleValue(); }
    private static void set(Object object, String name, double value) throws Exception {
        Field field = object.getClass().getDeclaredField(name); field.setAccessible(true); field.setDouble(object, value);
    }
    private static Button findButton(Node node, String text) {
        if (node instanceof Button && ((Button) node).getText().equals(text)) return (Button) node;
        if (node instanceof Parent) for (Node child : ((Parent) node).getChildrenUnmodifiable()) {
            Button result = findButton(child, text); if (result != null) return result;
        }
        return null;
    }
    private static void click(Node root, String text) {
        Button button = findButton(root, text); require(button != null && !button.isDisabled(), text + " available"); button.fire();
    }
    private static boolean hasText(Node node, String text) {
        if (node instanceof Label && ((Label) node).getText().contains(text)) return true;
        if (node instanceof Parent) for (Node child : ((Parent) node).getChildrenUnmodifiable()) if (hasText(child, text)) return true;
        return false;
    }
    private static void close(double actual, double expected, String message) { require(Math.abs(actual - expected) < 0.000001, message); }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) { launch(args); }
}
