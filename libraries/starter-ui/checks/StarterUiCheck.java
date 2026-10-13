import java.nio.file.Path;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;
import zero.starterui.StartScreen;
import zero.starterui.Hud;
import zero.starterui.ScoreDisplay;

/** Finite trusted-local JavaFX check, outside the production source tree. */
public class StarterUiCheck extends Application {
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static Button button(Node node, String text) {
        if (node instanceof Button b && b.getText().equals(text)) return b;
        if (node instanceof Parent p) {
            for (Node child : p.getChildrenUnmodifiable()) {
                Button b = button(child, text);
                if (b != null) return b;
            }
        }
        return null;
    }
    private static Label label(Node node, String text) {
        if (node instanceof Label l && l.getText().equals(text)) return l;
        if (node instanceof Parent p) {
            for (Node child : p.getChildrenUnmodifiable()) {
                Label l = label(child, text);
                if (l != null) return l;
            }
        }
        return null;
    }
    private static void nullAction(Runnable construct, String message) {
        try { construct.run(); throw new AssertionError("Null action was accepted"); }
        catch (IllegalArgumentException expected) { require(expected.getMessage().equals(message), "Useful null-action error"); }
    }
    public void start(Stage stage) {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("STARTER_UI_TIMEOUT"); System.exit(1);
        });
        watchdog.setDaemon(true); watchdog.start();
        try {
            Path expected = Path.of(System.getenv("EXPECTED_STARTER_UI_JAR")).toRealPath();
            for (Class<?> type : new Class<?>[]{StartScreen.class, Hud.class, ScoreDisplay.class}) {
                Path actual = Path.of(type.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath();
                require(actual.equals(expected), type.getSimpleName() + " comes from installed package JAR");
            }
            nullAction(() -> new StartScreen("Title", "Instructions", null), "Start needs an action.");
            nullAction(() -> new Hud(null), "Restart needs an action.");
            int[] calls = {0, 0};
            StartScreen start = new StartScreen("Title", "Instructions", () -> calls[0]++);
            Hud hud = new Hud(() -> calls[1]++);
            ScoreDisplay score = new ScoreDisplay("Questions");
            require(start.view() == start.view() && hud.view() == hud.view() && score.view() == score.view(), "Views are stable");
            stage.setScene(new Scene(new VBox(start.view(), hud.view(), score.view()), 500, 400));
            stage.show();
            require(label(start.view(), "Title") != null && label(start.view(), "Instructions") != null, "Welcome text");
            button(start.view(), "Start").fire(); button(start.view(), "Start").fire();
            button(hud.view(), "Restart").fire();
            require(calls[0] == 2 && calls[1] == 1, "App-owned callbacks execute");
            require(label(hud.view(), "Score: 0") != null, "Hud composes default ScoreDisplay");
            Node hudView = hud.view();
            hud.setScore(-5); hud.setMessage("Try again");
            require(label(hud.view(), "Score: -5") != null && label(hud.view(), "Try again") != null, "HUD explicit updates");
            hud.setScore(Integer.MAX_VALUE); hud.setMessage("Done");
            require(hud.view() == hudView && label(hud.view(), "Done") != null && label(hud.view(), "Try again") == null, "HUD updates same view");
            require(((Label) score.view()).getText().equals("Questions: 0"), "Caption constructor");
            score.setScore(Integer.MIN_VALUE);
            require(((Label) score.view()).getText().equals("Questions: " + Integer.MIN_VALUE), "Score accepts every int without clamping");
            Hud otherHud = new Hud(() -> {}); ScoreDisplay otherScore = new ScoreDisplay();
            StartScreen otherStart = new StartScreen("Other", "Other instructions", () -> {});
            require(otherHud.view() != hud.view() && otherScore.view() != score.view() && otherStart.view() != start.view(), "Independent views");
            require(label(otherHud.view(), "Score: 0") != null && ((Label) otherScore.view()).getText().equals("Score: 0"), "Independent displayed state");
            System.out.println("STARTER_UI_OK");
        } catch (Throwable failure) {
            failure.printStackTrace(); System.exit(1);
        } finally { stage.close(); Platform.exit(); }
    }
    public static void main(String[] args) { launch(args); }
}
