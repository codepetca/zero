import javafx.scene.control.Button;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import zero.SimpleApp;
import zero.community.HealthBar;

public class Main extends SimpleApp {
    private int health = 100;
    private HealthBar bar;
    @Override public void settings() { title("Try HealthBar"); size(420, 220); }
    @Override public void setup() {
        bar = new HealthBar(100);
        Button damage = new Button("Take 25 damage");
        Button heal = new Button("Heal 10");
        Button reset = new Button("Reset");
        damage.setOnAction(event -> { health = Math.max(0, health - 25); bar.setHealth(health); });
        heal.setOnAction(event -> { health = Math.min(100, health + 10); bar.setHealth(health); });
        reset.setOnAction(event -> { health = 100; bar.setHealth(health); });
        show(new VBox(16, bar.view(), new HBox(8, damage, heal, reset)));
    }
    public static void main(String[] args) { launch(args); }
}
