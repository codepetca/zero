import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import zero.SimpleApp;
import zero.healthbars.SegmentedHealthBar;

/** App rules own health; the library only presents explicit updates. */
public class Main extends SimpleApp {
    private int health = 100;
    private final SegmentedHealthBar meter = new SegmentedHealthBar(100);
    private final Button hit = new Button("Take 25 damage");
    private final Button heal = new Button("Heal 10");
    private final Button reset = new Button("Restart adventure");

    @Override public void settings() { title("Adventure health"); size(420, 200); }

    @Override public void setup() {
        hit.setOnAction(event -> { health = Math.max(0, health - 25); refresh(); });
        heal.setOnAction(event -> { health = Math.min(100, health + 10); refresh(); });
        reset.setOnAction(event -> { health = 100; refresh(); });
        show(new VBox(12, new Label("Survive the adventure"), meter.view(), new HBox(8, hit, heal), reset));
        refresh();
    }

    private void refresh() { meter.setHealth(health); }
    public static void main(String[] args) { launch(args); }
}
