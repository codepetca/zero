import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.stage.Stage;

import java.util.StringJoiner;
import java.util.function.Predicate;

/** Exercise the replayed Main in a native JavaFX window. */
public final class ProjectNewGreetingCheck extends Application {
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static <T extends Node> T find(Parent root, String selector, Class<T> type, Predicate<T> match) {
        return root.lookupAll(selector).stream().filter(type::isInstance).map(type::cast)
                .filter(match).findFirst().orElseThrow(() -> new AssertionError("Missing Greeting control: " + selector));
    }

    private static void verifyTutorial(Parent root, StringJoiner observed) {
        Label greeting = find(root, ".label", Label.class, label -> "Hello, Java!".equals(label.getText()));
        TextField field = find(root, ".text-field", TextField.class, text -> "Your name".equals(text.getPromptText()));
        Button button = find(root, ".button", Button.class, control -> "Say hello".equals(control.getText()));
        require(greeting.isVisible() && field.isVisible() && button.isVisible(), "Greeting controls were hidden.");
        require(field.getText().isEmpty(), "The Greeting name field should start empty.");
        for (String name : new String[]{"Sam", "Ada"}) {
            field.replaceText(0, field.getLength(), name);
            button.fire();
            String expected = "Hello, " + name + "!";
            require(expected.equals(greeting.getText()), "Expected " + expected + " after activating Say hello.");
            observed.add(greeting.getText());
        }
    }

    @Override public void start(Stage stage) {
        Main app = new Main();
        StringJoiner observed = new StringJoiner(" | ");
        try {
            app.start(stage);
            require(stage.isShowing(), "Greeting window did not open.");
            Parent root = stage.getScene().getRoot();
            root.applyCss();
            root.layout();
            verifyTutorial(root, observed);
        } finally {
            stage.close();
            Platform.exit();
        }
        System.out.println("ZERO_PROJECT_NEW_NATIVE_GREETING_OK " + observed);
    }

    public static void main(String[] args) { launch(args); }
}
