import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.stage.Stage;

/** Test-only native driver; never copied into the normal student source inventory. */
public final class PrototypeCheck extends Application {
    @Override public void start(Stage stage) {
        try {
            Main app = new Main();
            app.start(stage);
            Parent root = stage.getScene().getRoot();

            score(root, 0);
            click(root, "Add one"); click(root, "Add one"); score(root, 2);
            click(root, "Bar score"); score(root, 2);
            require(hasText(root, "[##--------]"), "bar selection copies the current count");
            click(root, "Add one"); score(root, 3);
            require(hasText(root, "[###-------]"), "live bar updates through ScoreView");
            click(root, "Text score"); score(root, 3);
            require(!hasText(root, "[###-------]"), "text selection replaces the bar");
            click(root, "Bar score"); click(root, "Reset"); score(root, 0);
            require(hasText(root, "[----------]"), "Reset retains the selected presentation");
            click(root, "Add one"); score(root, 1);
            verifyContract();
            Stage otherStage = new Stage(); Main other = new Main(); other.start(otherStage);
            Parent otherRoot = otherStage.getScene().getRoot();
            click(otherRoot, "Add one"); click(otherRoot, "Add one");
            score(otherRoot, 2); score(root, 1);
            other.stop(); otherStage.close();
            app.stop(); stage.close();
            System.out.println("ZERO_COUNTER_PROTOTYPE_OK text/bar selection preserves count, live updates/reset and independent stable ScoreView instances");
            Platform.exit();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }
    private static void verifyContract() {
        ScoreView text = new ScoreDisplay();
        ScoreView bar = new BarScoreDisplay();
        zero.ui.Element textView = text.view(), barView = bar.view();
        Parent textRoot = (Parent) new zero.ui.Column(textView).fxNode();
        Parent barRoot = (Parent) new zero.ui.Column(barView).fxNode();
        text.setScore(Integer.MIN_VALUE); bar.setScore(Integer.MAX_VALUE);
        score(textRoot, Integer.MIN_VALUE); score(barRoot, Integer.MAX_VALUE);
        require(hasText(barRoot, "[##########]"), "only bar length clamps for maximum int");
        bar.setScore(Integer.MIN_VALUE); score(barRoot, Integer.MIN_VALUE);
        require(hasText(barRoot, "[----------]"), "negative score stays exact with empty bar");
        score(textRoot, Integer.MIN_VALUE);
        require(text.view() == textView && bar.view() == barView, "component views stay stable after updates");
        require(textView != barView && textView.fxNode().getParent() == textRoot
                && barView.fxNode().getParent() == barRoot, "independent views each retain one owner");
    }
    private static void click(Parent root, String text) {
        Button found = button(root, text); require(found != null, "visible button: " + text); found.fire();
    }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static Button button(Parent parent, String text) {
        for (Node node : parent.getChildrenUnmodifiable()) {
            if (node instanceof Button button && button.getText().equals(text)) return button;
            if (node instanceof Parent child) {
                Button found = button(child, text);
                if (found != null) return found;
            }
        }
        return null;
    }
    private static boolean hasText(Parent parent, String text) {
        for (Node node : parent.getChildrenUnmodifiable()) {
            if (node instanceof Label label && label.getText().equals(text)) return true;
            if (node instanceof Parent child && hasText(child, text)) return true;
        }
        return false;
    }
    private static void score(Parent root, int expected) {
        if (!hasText(root, "Score: " + expected)) throw new AssertionError("Expected counter score " + expected);
    }
    public static void main(String[] args) { launch(args); }
}
