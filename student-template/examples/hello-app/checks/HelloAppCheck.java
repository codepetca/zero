import javafx.application.Application;
import javafx.application.Platform;
import javafx.event.Event;
import javafx.event.ActionEvent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.stage.Stage;

/** Synthetic ordinary-control behavior checks in the real JavaFX window. */
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
            VBox screen = (VBox) ((BorderPane) root).getCenter();
            Label heading = (Label) screen.getChildren().get(0);
            Label instructions = (Label) screen.getChildren().get(1);
            TextField name = (TextField) screen.getChildren().get(2);
            HBox actions = (HBox) screen.getChildren().get(3);
            Button hello = (Button) actions.getChildren().get(0);
            Button reset = (Button) actions.getChildren().get(1);
            Label feedback = (Label) screen.getChildren().get(4);
            require(stage.isShowing() && screen.getStylesheets().isEmpty(),
                    "Ordinary controls run without an external stylesheet");
            require(heading.getText().equals("Hello, Java") && heading.getFont().getSize() == 32
                    && heading.getFont().getStyle().contains("Bold"), "Clear heading typography");
            require(screen.getPadding().getTop() == 28 && screen.getSpacing() == 16
                    && actions.getSpacing() == 12, "Layout retains padding and spacing");
            require(instructions.isWrapText() && feedback.isWrapText(), "Instruction and feedback text wrap");
            for (var control : new javafx.scene.control.Labeled[] {heading, instructions, hello, reset, feedback}) {
                require(control.getFont().getSize() >= 12 && control.getTextFill() != null
                        && control.getOpacity() > 0, "Theme supplies readable control text");
            }
            require(name.getFont().getSize() >= 12 && name.getPromptText().equals("Your name"),
                    "Name field retains a readable font and prompt");
            require(name.isFocusTraversable() && hello.isFocusTraversable() && reset.isFocusTraversable(),
                    "Ordinary controls retain keyboard focus traversal");
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
            require(stage.getScene().getFocusOwner() == name, "Reset returns scene focus to the name field");
            save(screen, "focus.png");
            name.setText("Lin"); hello.fire();
            require(feedback.getText().equals("Hello, Lin!"), "Greeting after reset");

            hello.setDisable(true); root.applyCss();
            name.setText("Ignored");
            hello.fire();
            require(feedback.getText().equals("Hello, Lin!"), "Disabled button cannot act");
            System.out.println("HELLO_APP_OK greeting Enter blank reset focus layout platform-theme");
        } catch (Throwable failure) {
            failure.printStackTrace(); System.exit(1);
        } finally {
            app.stop(); stage.close(); Platform.exit();
        }
    }

    public static void main(String[] args) { launch(args); }
}
