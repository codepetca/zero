import javafx.application.Application;
import javafx.application.Platform;
import javafx.stage.Stage;

public class MissingStyleCheck extends Application {
    @Override public void start(Stage stage) {
        try {
            new Main().start(stage);
            throw new AssertionError("Missing CSS must give a useful startup error");
        } catch (IllegalStateException expected) {
            if (!expected.getMessage().equals("Copy theme.css to src/main/resources/hello-app/theme.css.")) {
                expected.printStackTrace(); System.exit(1);
            }
            System.out.println("MISSING_STYLE_OK");
        } catch (Throwable failure) {
            failure.printStackTrace(); System.exit(1);
        } finally {
            stage.close(); Platform.exit();
        }
    }
    public static void main(String[] args) { launch(args); }
}
