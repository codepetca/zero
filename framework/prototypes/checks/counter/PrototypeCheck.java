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
            Button add = button(root, "Add one");
            Button reset = button(root, "Reset");
            score(root, 0);
            add.fire(); add.fire(); score(root, 2);
            reset.fire(); score(root, 0);
            add.fire(); score(root, 1);
            app.stop(); stage.close();
            System.out.println("ZERO_COUNTER_PROTOTYPE_OK Add one twice=2, Reset=0, Add one=1; native UI and shared display");
            Platform.exit();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }
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
