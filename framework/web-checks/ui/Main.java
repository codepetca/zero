import zero.GameApp;
import zero.Color;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;

/** Real-browser behavior probe for the small Zero-owned UI surface. */
public final class Main extends GameApp {
    private final Label status = new Label("Before");
    private int clicks, frames;
    @Override public void settings() { title("Zero UI check"); size(320, 180); padding(0); }
    @Override public void setup() {
        require(status.getText().equals("Before"), "Label constructor text");
        status.setText("Zero UI ready");
        require(status.getText().equals("Zero UI ready"), "Label replacement text");
        Button button = new Button("Before");
        button.setText("Zero button");
        require(button.getText().equals("Zero button"), "Button replacement text");
        button.onClick(() -> { throw new IllegalStateException("Old callback must be replaced"); });
        button.onClick(() -> { clicks++; status.setText("Zero clicks: " + clicks); });
        Column defaultColumn = new Column();
        require(defaultColumn.getSpacing() == 8, "Default column spacing");
        Button replace = new Button("Replace controls");
        replace.onClick(() -> controls(new Column(new Label("Replacement HUD"))));
        Column controls = new Column(8, status, button, replace);
        controls.setSpacing(12);
        require(controls.getSpacing() == 12, "Column spacing change");
        boolean invalid = false;
        try { controls.setSpacing(Double.NaN); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid && controls.getSpacing() == 12, "Column spacing atomic validation");
        invalid = false;
        try { new Column(-1); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid, "Negative spacing rejected");
        Label shared = new Label("Shared");
        invalid = false;
        try { new Column(shared, shared); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid, "Duplicate children rejected");
        new Column(shared);
        invalid = false;
        try { new Column(shared); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid, "Parented child rejected");
        invalid = false;
        try { Color.rgb(0, 256, 0); } catch (IllegalArgumentException expected) { invalid = true; }
        require(invalid, "Zero Color validates channels");
        controls(controls);
        controls(controls);
    }
    @Override public void update(double seconds) { frames++; }
    @Override public void draw() {
        background(Color.WHITE);
        fill(Color.BLACK); textSize(16);
        text("Zero UI frames: " + frames, 10, 25);
        text("Zero UI pointer: " + (int) mouseX() + "," + (int) mouseY(), 10, 50);
        fill(Color.rgb(17, 99, 203)); rect(10, 70, 20, 20);
        fill(Color.BLUE); rect(40, 70, 20, 20);
        fill(Color.GOLD); rect(70, 70, 20, 20);
        stroke(Color.BLACK); strokeWidth(2); outlineRect(100, 70, 20, 20);
    }
    private static void require(boolean condition, String name) {
        if (!condition) throw new IllegalStateException(name);
    }
    public static void main(String[] args) { launch(args); }
}
