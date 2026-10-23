import java.lang.reflect.Field;
import javafx.animation.PauseTransition;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.stage.Stage;
import javafx.util.Duration;
import zero.App;
import zero.GameApp;

/** Finite checks for reviewed maintainer checkpoints, never student source. */
public class CheckpointHarness extends Application {
    private static final String id = System.getenv("ZERO_CHECKPOINT_ID");
    private static final boolean withMedia = "with-media".equals(System.getenv("ZERO_CHECKPOINT_MODE"));

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(id + ": " + message);
    }

    private static Object field(Object target, String name) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(target);
    }

    // Maintainer checks inspect the actual controls in both Zero-first and older
    // JavaFX checkpoints. Students do not need this interoperability bridge.
    private static Node node(Object component) {
        if (component instanceof zero.ui.Element element) return element.fxNode();
        return (Node) component;
    }

    private static void setDouble(Object target, String name, double value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.setDouble(target, value);
    }

    private static double number(Object target, String name) throws Exception {
        return ((Number) field(target, name)).doubleValue();
    }

    private static Button button(Node node, String label) {
        if (node instanceof Button candidate && candidate.getText().equals(label)) return candidate;
        if (node instanceof Parent parent) {
            for (Node child : parent.getChildrenUnmodifiable()) {
                Button found = button(child, label);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static Button button(Stage stage, String label) {
        Button found = button(stage.getScene().getRoot(), label);
        require(found != null, label + " button exists");
        return found;
    }

    private static Label score(Main app) throws Exception {
        if (id.equals("7") || id.equals("9")) return (Label) node(field(app, "scoreLabel"));
        Object display = field(app, "score");
        return (Label) display.getClass().getMethod("view").invoke(display);
    }

    private static void checkGreeting(Main app, Stage stage) {
        Node center = ((BorderPane) stage.getScene().getRoot()).getCenter();
        if (id.equals("0")) {
            require(center instanceof Label && ((Label) center).getText().equals("Hello, Java!"), "written greeting is visible");
            return;
        }
        VBox screen = (VBox) center;
        Label greeting = (Label) screen.getChildren().get(0);
        Button hello = button(stage, "Say hello");
        require(greeting.getText().equals("Hello, Java!"), "earlier greeting survives next lesson");
        if (id.equals("2")) {
            TextField name = (TextField) screen.getChildren().get(1);
            require(name.getPromptText().equals("Your name"), "name prompt survives the Zero UI facade");
            name.setText("Sam"); hello.fire();
            require(greeting.getText().equals("Hello, Sam!"), "typed name changes the existing label");
            name.setText("Ada"); hello.fire();
            require(greeting.getText().equals("Hello, Ada!"), "second name is read on second click");
        } else {
            hello.fire();
            require(greeting.getText().equals("You did it!"), "button changes the existing label");
        }
        require(screen.getChildren().get(0) == greeting, "greeting node is reused");
    }

    private static void checkSingleQuiz(Main app, Stage stage) throws Exception {
        VBox screen = (VBox) ((BorderPane) stage.getScene().getRoot()).getCenter();
        Label prompt = (Label) screen.getChildren().get(0);
        TextField answer = (TextField) node(field(app, "answer"));
        Label feedback = (Label) node(field(app, "feedback"));
        Button check = button(stage, "Check");
        require(prompt.getText().equals("What is 2 + 3?"), "same question continues through lessons 3–6");
        answer.setText("4"); check.fire();
        require(feedback.getText().equals("Try again."), "wrong answer invites retry");
        answer.setText("5"); check.fire();
        require(feedback.getText().equals("Correct!"), "correct answer updates feedback");
        if (id.equals("3")) return;
        Label attemptsLabel = (Label) node(field(app, "attemptsLabel"));
        require(attemptsLabel.getText().equals("Attempts: 2"), "two checks count as two attempts");
        if (id.equals("4")) return;
        button(stage, "Reset").fire();
        require(attemptsLabel.getText().equals("Attempts: 0") && answer.getText().isEmpty()
                && feedback.getText().isEmpty(), "Reset clears count, input and feedback");
        answer.setText("5"); check.fire();
        require(attemptsLabel.getText().equals("Attempts: 1"), "check works after Reset");
        if (id.equals("6")) {
            Object counter = field(app, "attempts");
            require((int) counter.getClass().getMethod("value").invoke(counter) == 1, "Counter owns current value");
            Object other = counter.getClass().getConstructor().newInstance();
            other.getClass().getMethod("increment").invoke(other);
            other.getClass().getMethod("increment").invoke(other);
            require((int) other.getClass().getMethod("value").invoke(other) == 2
                    && (int) counter.getClass().getMethod("value").invoke(counter) == 1,
                    "Counter instances have independent state");
        }
    }

    private static void checkStudy(Main app, Stage stage) throws Exception {
        TextField answer = (TextField) node(field(app, "answer"));
        Label question = (Label) node(field(app, "questionLabel"));
        Label feedback = (Label) node(field(app, "feedback"));
        Label attempts = (Label) node(field(app, "attemptsLabel"));
        Label score = score(app);
        Button check = button(stage, "Check");
        Button next = button(stage, "Next");
        Button restart = button(stage, "Restart");
        require(question.getText().startsWith("Question 1 of 3") && score.getText().equals("Score: 0")
                && attempts.getText().equals("Attempts: 0") && next.isDisabled(), "session starts at zero with Next locked");
        next.fire();
        require(question.getText().startsWith("Question 1 of 3"), "Next cannot skip unanswered question");
        answer.setText("4"); check.fire();
        require(feedback.getText().equals("Try again.") && score.getText().equals("Score: 0")
                && attempts.getText().equals("Attempts: 1") && !check.isDisabled(), "wrong answer permits retry without points");
        answer.setText(" 5 "); check.fire();
        require(score.getText().equals("Score: 1") && attempts.getText().equals("Attempts: 2")
                && check.isDisabled() && !next.isDisabled(), "trimmed correct answer scores once and unlocks Next");
        check.fire();
        require((int) field(app, "points") == 1, "repeat check cannot add a point");
        next.fire();
        require(question.getText().startsWith("Question 2 of 3") && answer.getText().isEmpty()
                && feedback.getText().isEmpty() && next.isDisabled(), "Next clears old answer and locks itself");
        answer.setText("1"); check.fire(); next.fire();
        answer.setText(" TRUE "); check.fire();
        require(score.getText().equals("Score: 3"), "all three questions award one point each");
        next.fire();
        require(question.getText().equals("Finished! Score: 3 / 3") && answer.isDisabled()
                && check.isDisabled() && next.isDisabled(), "last Next ends session and locks input");
        restart.fire();
        require(question.getText().startsWith("Question 1 of 3") && score.getText().equals("Score: 0")
                && attempts.getText().equals("Attempts: 0") && answer.getText().isEmpty()
                && !answer.isDisabled() && !check.isDisabled() && next.isDisabled(), "Restart resets all visible state");
        require((int) field(app, "points") == 0 && !(boolean) field(app, "finished"), "Restart resets owned rule state");
        if (id.equals("7")) {
            for (String response : new String[] {"5", "1", " TRUE "}) {
                answer.setText(response);
                check.fire();
                require(check.isDisabled() && !next.isDisabled(), "second session still locks Check and unlocks Next");
                next.fire();
            }
            require((boolean) field(app, "finished") && score.getText().equals("Score: 3")
                    && answer.isDisabled(), "second complete session reuses controls and scores normally");
            restart.fire();
            require(score.getText().equals("Score: 0") && !answer.isDisabled()
                    && !check.isDisabled() && next.isDisabled(), "second Restart restores enabled state again");
        }
        if (id.startsWith("10/") || id.startsWith("11/")) checkScoreDisplay(app);
    }

    private static void checkScoreDisplay(Main app) throws Exception {
        Object display = field(app, "score");
        Label view = (Label) display.getClass().getMethod("view").invoke(display);
        Object second = display.getClass().getConstructor().newInstance();
        Label secondView = (Label) second.getClass().getMethod("view").invoke(second);
        require(secondView != view && secondView.getText().equals("Score: 0"), "new display has its own view");
        second.getClass().getMethod("setScore", int.class).invoke(second, 9);
        require(secondView.getText().equals("Score: 9") && view.getText().equals("Score: 0"), "display instances update independently");
        if (id.startsWith("11/") || id.startsWith("12/")) {
            second.getClass().getMethod("setColor", Color.class).invoke(second, Color.DARKSLATEBLUE);
            require(secondView.getTextFill().equals(Color.DARKSLATEBLUE), "setColor changes display text color");
        }
    }

    private static void checkMovement(Main app) throws Exception {
        Object player = field(app, "player");
        double before = number(player, "x");
        player.getClass().getMethod("update", int.class, int.class, double.class, double.class, double.class)
                .invoke(player, 1, 0, 0.5, 640.0, 400.0);
        require(number(player, "x") > before, "explicit update moves player right");
        player.getClass().getMethod("update", int.class, int.class, double.class, double.class, double.class)
                .invoke(player, 1, 1, 100.0, 640.0, 400.0);
        require(number(player, "x") == 616.0 && number(player, "y") == 376.0, "whole player stays inside right and bottom edges");
        player.getClass().getMethod("update", int.class, int.class, double.class, double.class, double.class)
                .invoke(player, -1, -1, 100.0, 640.0, 400.0);
        require(number(player, "x") == 0.0 && number(player, "y") == 0.0, "whole player stays inside left and top edges");
    }

    private static void checkGame(Main app, Stage stage) throws Exception {
        GameApp sketch = (GameApp) (App) app;
        require(sketch.layout().getCenter() == sketch.canvas(), "canvas remains in game layout");
        Label score = score(app);
        require(score.getText().equals("Score: 0"), "game begins with zero score");
        if (!id.equals("9")) checkScoreDisplay(app);
        if (id.startsWith("12/")) {
            require((field(app, "sprite") != null) == withMedia && (field(app, "chime") != null) == withMedia,
                    "media resource mode loads or falls back explicitly");
            if (withMedia) require(score.getTextFill().equals(Color.DARKSLATEBLUE), "game applies ScoreDisplay color");
        }
        Object[] coins = (Object[]) field(app, "coins");
        Object player = field(app, "player");
        for (int index = 0; index < coins.length; index++) {
            Object coin = coins[index];
            setDouble(player, "x", number(coin, "x"));
            setDouble(player, "y", number(coin, "y"));
            app.getClass().getMethod("update", double.class).invoke(app, 0.0);
            app.getClass().getMethod("update", double.class).invoke(app, 0.0);
            require((int) field(app, "points") == index + 1 && (boolean) coin.getClass().getMethod("isCollected").invoke(coin),
                    "coin " + (index + 1) + " scores exactly once");
            require(score.getText().equals("Score: " + (index + 1)), "score view follows app-owned points");
        }
        require((boolean) field(app, "won") && ((Label) node(field(app, "message"))).getText().contains("You win"),
                "all coins show win state");
        if (id.startsWith("12/")) {
            int expected = withMedia ? coins.length : 0;
            require((int) field(app, "plays") == expected
                    && ((Label) node(field(app, "soundStatus"))).getText().equals("Chimes: " + expected),
                    "sound counter matches available media");
        }
        Button restart = button(stage, "Restart");
        restart.fire();
        require((int) field(app, "points") == 0 && !(boolean) field(app, "won")
                && score.getText().equals("Score: 0"), "Restart clears score and win");
        for (Object coin : (Object[]) field(app, "coins")) {
            require(!(boolean) coin.getClass().getMethod("isCollected").invoke(coin), "Restart restores coins");
        }
        if (id.equals("12/scrolling")) {
            Object camera = field(app, "camera");
            require((double) camera.getClass().getMethod("x").invoke(camera) == 0.0, "Restart resets camera");
            setDouble(field(app, "player"), "x", 1000.0);
            app.getClass().getMethod("update", double.class).invoke(app, 0.0);
            require((double) camera.getClass().getMethod("x").invoke(camera) > 0.0, "camera follows world position");
        }
    }

    private static void check(Main app, Stage stage) throws Exception {
        if (id.matches("[34567]") || id.endsWith("/study")) {
            BorderPane root = (BorderPane) stage.getScene().getRoot();
            require(root.getPadding().equals(new javafx.geometry.Insets(20)), "Study has 20px edge padding");
            require(root.getCenter().getLayoutX() == 20 && root.getCenter().getLayoutY() == 20,
                    "Study controls are inset from the window edges");
        }
        if (id.matches("[012]")) checkGreeting(app, stage);
        else if (id.matches("[3456]")) checkSingleQuiz(app, stage);
        else if (id.equals("7") || id.equals("10/study") || id.equals("11/study")) checkStudy(app, stage);
        else if (id.equals("8")) checkMovement(app);
        else checkGame(app, stage);
    }

    @Override public void start(Stage stage) {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(30_000); } catch (InterruptedException ignored) { return; }
            System.err.println("CHECKPOINT_TIMEOUT " + id);
            System.exit(1);
        });
        watchdog.setDaemon(true);
        watchdog.start();
        Main app = new Main();
        try {
            app.start(stage);
        } catch (Throwable failure) {
            failure.printStackTrace();
            System.exit(1);
            return;
        }
        PauseTransition settle = new PauseTransition(Duration.millis(200));
        settle.setOnFinished(event -> {
            boolean passed = false;
            try {
                if (((App) app) instanceof GameApp) app.stop(); // Stop timer before deterministic update calls.
                BorderPane root = (BorderPane) stage.getScene().getRoot();
                require(root.getPadding().equals(new javafx.geometry.Insets(20)),
                        "tutorial content has 20 pixels of outer padding");
                if (((App) app) instanceof GameApp game) {
                    require(game.width() == 640 && game.height() == 400,
                            "outer padding preserves the fixed game canvas");
                } else {
                    var bounds = root.getCenter().localToScene(root.getCenter().getLayoutBounds());
                    require(bounds.getMinX() >= 19.99 && bounds.getMinY() >= 19.99,
                            "controls stay inset from the window edges");
                }
                check(app, stage);
                System.out.println("CHECKPOINT_OK " + id + (withMedia ? " with-media" : ""));
                passed = true;
            } catch (Throwable failure) {
                failure.printStackTrace();
            } finally {
                app.stop();
                stage.close();
                Platform.exit();
                if (!passed) System.exit(1);
            }
        });
        settle.play();
    }

    public static void main(String[] args) { launch(args); }
}
