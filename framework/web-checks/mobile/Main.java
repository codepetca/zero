import javafx.scene.control.Button;
import javafx.scene.control.TextField;
import javafx.scene.input.KeyCode;
import javafx.scene.input.MouseButton;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import zero.GameApp;

/** Fixed portrait game with ordinary JavaFX controls and outer padding. */
public final class Main extends GameApp {
    private int clicks, middleClicks, rightClicks, keyPresses;
    private TextField name;
    private String message = "Mobile controls ready";
    @Override public void settings() { title("Zero mobile check"); size(360, 640); padding(12); }
    @Override public void setup() {
        name = new TextField();
        name.setPromptText("Your name");
        Button greet = new Button("Greet mobile");
        greet.setOnAction(event -> message = "Hello, " + name.getText());
        name.setOnAction(event -> message = "Enter, " + name.getText());
        layout().setBottom(new VBox(4, name, greet));
        canvas().setAccessibleText("Zero portrait mobile check");
    }
    @Override public void update(double seconds) {
        if (mousePressed(MouseButton.PRIMARY)) clicks++;
        if (mousePressed(MouseButton.MIDDLE)) middleClicks++;
        if (mousePressed(MouseButton.SECONDARY)) rightClicks++;
        if (keyPressed(KeyCode.A)) keyPresses++;
    }
    @Override public void draw() {
        background(Color.WHITE); fill(Color.BLACK); textSize(14);
        text("Portrait ready", 10, 22);
        text(message, 10, 46);
        text("Mobile state: " + clicks + "," + middleClicks + "," + rightClicks + ","
                + mouseDown(MouseButton.PRIMARY) + "," + mouseDown(MouseButton.MIDDLE) + ","
                + mouseDown(MouseButton.SECONDARY) + "," + (int) mouseX() + "," + (int) mouseY()
                + "," + (int) width() + "," + (int) height() + "," + keyPresses + "," + keyDown(KeyCode.A), 5, 72);
        fill(Color.BLUE); rect(0, 0, 5, 5); rect(width() - 5, height() - 5, 5, 5);
    }
    public static void main(String[] args) { launch(args); }
}
