package hub.policy;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.stage.Stage;
/** Image readiness check: this source is trusted policy, never submitted input. */
public final class FixedSmoke extends Application {
    public void start(Stage stage) {
        stage.setScene(new Scene(new Label("Trusted JavaFX image readiness"), 320, 120));
        stage.show();
        Platform.runLater(() -> { stage.close(); Platform.exit(); });
    }
    public static void main(String[] args) { launch(args); }
}
