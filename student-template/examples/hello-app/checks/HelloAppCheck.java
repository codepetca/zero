import javafx.application.Application;
import javafx.application.Platform;
import javafx.css.PseudoClass;
import javafx.event.Event;
import javafx.event.ActionEvent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.stage.Stage;

/** Synthetic behavior/style checks in the real JavaFX window. */
public class HelloAppCheck extends Application {
    private static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }

    private static void save(VBox screen, String filename) throws Exception {
        var image = screen.snapshot(null, null);
        var pixels = image.getPixelReader();
        var output = new java.awt.image.BufferedImage((int) image.getWidth(),
                (int) image.getHeight(), java.awt.image.BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < output.getHeight(); y++) {
            for (int x = 0; x < output.getWidth(); x++) output.setRGB(x, y, pixels.getArgb(x, y));
        }
        javax.imageio.ImageIO.write(output, "png", new java.io.File(filename));
    }

    @Override
    public void start(Stage stage) {
        Main app = new Main();
        try {
            app.start(stage);
            var root = stage.getScene().getRoot();
            root.applyCss(); root.layout();
            VBox screen = (VBox) root.lookup(".screen");
            Button hello = (Button) root.lookup(".primary");
            TextField name = (TextField) root.lookup(".text-field");
            Label feedback = (Label) screen.getChildren().get(4);
            Button reset = (Button) root.lookupAll(".button").stream()
                    .filter(node -> node instanceof Button b && b.getText().equals("Start again"))
                    .findFirst().orElseThrow();
            require(screen.getBackground().getFills().get(0).getFill().equals(Color.web("#f6f5ff")),
                    "Copied classpath CSS applies to the screen");
            require(((Label) root.lookup(".heading")).getFont().getSize() == 32,
                    "Heading typography applies");
            require(hello.getBackground().getFills().get(0).getFill().equals(Color.web("#6457e8")),
                    "Primary button colour applies");
            require(hello.getBoundsInParent().getMaxX() <= screen.getWidth()
                    && feedback.getBoundsInParent().getMaxY() <= screen.getHeight(),
                    "Initial layout fits the configured window");
            save(screen, "initial.png");
            hello.fire();
            require(feedback.getText().equals("Please write your name first."), "Blank input feedback");
            name.setText("   "); hello.fire();
            require(feedback.getText().equals("Please write your name first."), "Whitespace feedback");
            name.setText("  Ada  "); hello.fire();
            require(feedback.getText().equals("Hello, Ada!"), "Trimmed greeting");
            name.setText("Grace"); Event.fireEvent(name, new ActionEvent());
            require(feedback.getText().equals("Hello, Grace!"), "Enter action handler");
            save(screen, "greeting.png");
            reset.fire();
            require(name.getText().isEmpty()
                    && feedback.getText().equals("Your greeting will appear here."), "Reset restores fields");
            name.setText("Lin"); hello.fire();
            require(feedback.getText().equals("Hello, Lin!"), "Greeting after reset");

            hello.pseudoClassStateChanged(PseudoClass.getPseudoClass("hover"), true);
            root.applyCss();
            require(hello.getBackground().getFills().get(0).getFill().equals(Color.web("#5344cf")),
                    "Synthetic hover style");
            hello.pseudoClassStateChanged(PseudoClass.getPseudoClass("pressed"), true);
            root.applyCss();
            require(hello.getBackground().getFills().get(0).getFill().equals(Color.web("#4435b3")),
                    "Synthetic pressed style");
            hello.pseudoClassStateChanged(PseudoClass.getPseudoClass("focused"), true);
            root.applyCss();
            require(hello.getBorder().getStrokes().get(0).getTopStroke().equals(Color.web("#22213b")),
                    "Synthetic focus remains visible");
            save(screen, "focus.png");
            hello.setDisable(true); root.applyCss();
            require(hello.getOpacity() == 0.55, "Disabled appearance");
            name.setText("Ignored");
            hello.fire();
            require(feedback.getText().equals("Hello, Lin!"), "Disabled button cannot act");
            System.out.println("HELLO_APP_OK feedback reset CSS layout resource");
        } catch (Throwable failure) {
            failure.printStackTrace(); System.exit(1);
        } finally {
            app.stop(); stage.close(); Platform.exit();
        }
    }

    public static void main(String[] args) { launch(args); }
}
