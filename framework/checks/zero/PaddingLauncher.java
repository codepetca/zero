package zero;

import evidence.ApiLifecycleChecks;
import evidence.ApiNative;

import javafx.application.Application;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.scene.control.Label;
import javafx.scene.layout.BorderPane;
import javafx.stage.Stage;

/** Finite padding checks that do not depend on native keyboard focus. */
public final class PaddingLauncher extends Application {
    @Override public void start(Stage unused) {
        Platform.setImplicitExit(false);
        try {
            ApiLifecycleChecks lifecycle=new ApiLifecycleChecks();lifecycle.startChecked(unused);
            ApiNative.resolveUi(unused);lifecycle.stopChecked();unused.close();
            verifyApp();
            verifyGameApp();
            ApiNative.emit();
            System.out.println("ZERO_PADDING_OK defaults, settings/setup/runtime changes, validation, replacement content, fixed canvas and initial window size");
            Platform.exit();
        } catch (Throwable failure) {
            failure.printStackTrace();
            System.exit(1);
        }
    }

    private void verifyApp() {
        Stage stage = new Stage();
        App app = new App() {
            @Override public void settings() { size(240, 160); }
            @Override public void setup() { show(new Label("Hello")); }
        };
        app.start(stage);
        BorderPane root = (BorderPane) stage.getScene().getRoot();
        require(root.getPadding().equals(Insets.EMPTY), "default padding is zero");
        app.padding(20);
        app.show(new Label("Replacement"));
        root.layout();
        require(root.getPadding().equals(new Insets(20)), "runtime padding survives show");
        require(root.getCenter().localToScene(0, 0).getX() >= 20, "content respects left padding");
        require(stage.getScene().getWidth() == 240 && stage.getScene().getHeight() == 160,
                "App retains configured content dimensions");
        for (double invalid : new double[] {-1, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            try { app.padding(invalid); throw new AssertionError("invalid padding accepted"); }
            catch (IllegalArgumentException expected) {
                require(expected.getMessage().contains("non-negative finite"), "useful padding error");
            }
            require(root.getPadding().equals(new Insets(20)), "invalid amount preserves previous padding");
        }
        app.padding(0);
        require(root.getPadding().equals(Insets.EMPTY), "zero removes padding");
        app.stop(); stage.close();

        App configured = new App() {
            @Override public void settings() { padding(20); }
            @Override public void setup() {
                show(new Label("Setup override"));
                padding(12.5);
            }
        };
        configured.start(stage);
        require(((BorderPane) stage.getScene().getRoot()).getPadding().equals(new Insets(12.5)),
                "setup overrides configured padding with fractional pixels");
        configured.stop(); stage.close();
    }

    private void verifyGameApp() {
        Stage stage = new Stage();
        GameApp app = new GameApp() {
            @Override public void settings() { size(120, 100); padding(20); }
        };
        app.start(stage);
        BorderPane root = (BorderPane) stage.getScene().getRoot();
        require(root.getPadding().equals(new Insets(20)), "GameApp inherits padding");
        require(stage.getScene().getWidth() == 160 && stage.getScene().getHeight() == 140,
                "initial game window includes padding around fixed canvas");
        require(app.canvas().localToScene(0, 0).getX() == 20
                && app.canvas().localToScene(0, 0).getY() == 20, "canvas origin is inset");
        app.padding(5);
        root.layout();
        require(app.width() == 120 && app.height() == 100, "runtime padding preserves canvas dimensions");
        require(stage.getScene().getWidth() == 160 && stage.getScene().getHeight() == 140,
                "runtime padding does not resize window");
        app.padding(0);
        require(root.getPadding().equals(Insets.EMPTY), "GameApp padding can be removed");
        app.stop(); stage.close();
    }

    private static void require(boolean condition, String description) {
        if (!condition) throw new AssertionError(description);
    }

    public static void main(String[] args) { launch(args); }
}
