import java.lang.reflect.Field;
import java.util.List;
import java.util.Set;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.input.KeyCode;
import javafx.stage.Stage;
import zero.ImageRegion;

/** Installed as GameCheck.java beside the unmodified example by the native runner. */
public class GameCheck extends Application {
    private Main app;
    private Stage window;

    @Override public void start(Stage stage) {
        window = stage;
        int result = 0;
        try {
            app = new Main();
            app.start(stage);
            require(state().equals("TITLE"), "starts at title");
            button("Play new round").fire();
            require(state().equals("PLAYING"), "Play starts the round");
            app.pause(); // Stop the real timer; manual frames below keep Main as update owner.
            ImageRegion sprite = (ImageRegion) field(app, "robot");
            require(sprite.width() == 32 && sprite.height() == 32, "bundled sprite loaded");
            app.draw();

            button("Pause").fire();
            require(app.isPaused() && state().equals("PAUSED"), "Pause button freezes gameplay");
            app.draw();
            button("Resume").fire();
            require(!app.isPaused() && state().equals("PLAYING"), "Resume button continues");
            app.pause();
            for (Enemy enemy : enemies()) enemy.disable();
            Player player = player();
            double x = player.x(), y = player.y();
            keys().add(KeyCode.D); keys().add(KeyCode.S);
            app.update(0.1);
            keys().clear();
            near(Math.hypot(player.x() - x, player.y() - y), 19, "one normalized diagonal update");
            near(player.rotation(), 45, "movement faces its direction");
            player.setPosition(719, 439);
            keys().add(KeyCode.RIGHT); keys().add(KeyCode.DOWN);
            app.update(0.1);
            keys().clear();
            near(player.x(), 705, "right clamp"); near(player.y(), 425, "bottom clamp");
            player.setPosition(1, 1);
            keys().add(KeyCode.LEFT); keys().add(KeyCode.UP);
            app.update(0.1);
            keys().clear();
            near(player.x(), 15, "left clamp"); near(player.y(), 15, "top clamp");

            Enemy drone = new Enemy(10, 10, 62);
            drone.chase(11, 10); drone.update(1);
            near(drone.x(), 11, "chase stops at target without overshoot");
            drone.chase(100, 10); drone.disable(); drone.update(1);
            require(!drone.isActive(), "drone stays disabled before recovery");
            near(drone.x(), 11, "disabled drone stays still");
            drone.update(1.5);
            require(drone.isActive(), "drone recovers after 2.5 seconds");
            drone.update(0.1); near(drone.x(), 17.2, "recovered drone resumes chase");

            Player target = new Player(sprite, 100, 220);
            target.steer(0, 0, 720, 440);
            require(target.takeHit() && target.health() == 2, "first damage accepted");
            require(!target.takeHit(), "immediate repeated damage blocked");
            target.update(1.19); require(!target.takeHit(), "protection lasts 1.2 seconds");
            target.update(0.02);
            require(target.takeHit() && target.health() == 1, "damage accepted after protection");
            Pulse shot = new Pulse(target);
            Enemy crossed = new Enemy(150, 220, 62);
            shot.update(0.2);
            require(Math.abs(shot.x() - crossed.x()) > 19 && shot.hits(crossed), "swept shot hits between endpoints");
            require(!shot.hits(new Enemy(150, 280, 62)), "swept shot misses a distant drone");
            shot.update(2); require(!shot.isActive(), "shot expires");

            app.restart(); app.pause();
            player().setRotation(90); keys().add(KeyCode.SPACE); app.update(0);
            require(pulses().size() == 1, "Space creates a shot");
            near(pulses().get(0).rotation(), 90, "shot inherits player's facing");
            app.update(0.1); require(pulses().size() == 1, "held fire respects cooldown");
            app.update(0.19); keys().clear();
            require(pulses().size() == 2, "held fire repeats after cooldown");
            app.restart(); app.pause();
            player = player();
            enemies()[0].setPosition(170, 220);
            enemies()[1].disable(); enemies()[2].disable();
            pulses().add(new Pulse(player));
            app.update(0.2);
            require(!enemies()[0].isActive() && pulses().isEmpty(), "actual round disables hit drone and removes shot");
            require((int) field(app, "points") == 0, "shooting does not award coin score");

            app.restart(); app.pause();
            for (Enemy enemy : enemies()) enemy.disable();
            Coin[] coins = coins();
            player = player(); player.setPosition(coins[0].x(), coins[0].y());
            app.update(0); app.update(0);
            require(coins[0].isCollected() && (int) field(app, "points") == 1, "coin scores exactly once");
            require(((zero.ui.Label) field(app, "score")).getText().equals("Coins: 1 / 8"), "live score updates");
            for (int i = 1; i < coins.length; i++) {
                player.setPosition(coins[i].x(), coins[i].y()); app.update(0);
            }
            require(state().equals("WON") && player.health() == 3, "all coins and surviving health win");
            x = player.x(); keys().add(KeyCode.RIGHT); app.update(0.1); keys().clear();
            near(player.x(), x, "win stops movement"); app.draw();
            button("Restart").fire(); app.pause();
            require(state().equals("PLAYING") && (int) field(app, "points") == 0, "Restart clears win and score");
            for (Coin coin : coins()) require(!coin.isCollected(), "Restart restores coins");
            player().takeHit(); pulses().add(new Pulse(player()));
            set(app, "shotWait", 0.2);
            button("Pause").fire(); button("Restart").fire();
            require(!app.isPaused() && state().equals("PLAYING"), "Restart clears pause");
            require(player().health() == 3 && pulses().isEmpty(), "Restart clears damage and shots");
            near((double) field(player(), "protection"), 0, "Restart clears protection");
            near((double) field(app, "shotWait"), 0, "Restart clears firing cooldown");
            for (Enemy enemy : enemies()) require(enemy.isActive(), "Restart restores drones");
            app.pause();

            coins = coins();
            for (int i = 0; i < coins.length - 1; i++) coins[i].collect();
            set(app, "points", 7); set(player(), "health", 1);
            Coin last = coins[coins.length - 1];
            player().setPosition(last.x(), last.y());
            enemies()[0].setPosition(last.x(), last.y());
            enemies()[1].disable(); enemies()[2].disable();
            app.update(0);
            require(player().health() == 0 && (int) field(app, "points") == 8 && state().equals("LOST"), "fatal hit wins last-coin tie");
            require(((zero.ui.Label) field(app, "health")).getText().equals("Health: 0 / 3"), "live health updates");
            app.draw(); button("Restart").fire(); app.pause();
            require(state().equals("PLAYING") && player().health() == 3, "Restart recovers from loss");
            button("Help").fire(); require(state().equals("TITLE"), "Help returns to title");
            button("Play new round").fire(); require(state().equals("PLAYING"), "Play works a second time");
        } catch (Throwable failure) {
            failure.printStackTrace(); result = 1;
        } finally {
            try { if (app != null) app.stop(); } catch (Throwable failure) { failure.printStackTrace(); result = 1; }
            try { stage.close(); } catch (Throwable failure) { failure.printStackTrace(); result = 1; }
            Platform.exit();
        }
        if (result != 0) System.exit(result);
        else System.out.println("ZERO_BASIC_GAME_OK");
    }

    private Player player() throws Exception { return (Player) field(app, "player"); }
    private Enemy[] enemies() throws Exception { return (Enemy[]) field(app, "enemies"); }
    private Coin[] coins() throws Exception { return (Coin[]) field(app, "coins"); }
    private String state() throws Exception { return field(app, "state").toString(); }
    @SuppressWarnings("unchecked") private List<Pulse> pulses() throws Exception { return (List<Pulse>) field(app, "pulses"); }
    @SuppressWarnings("unchecked") private Set<KeyCode> keys() throws Exception { return (Set<KeyCode>) field(app, "keys"); }
    private static Field find(Object owner, String name) throws Exception {
        for (Class<?> type = owner.getClass(); type != null; type = type.getSuperclass()) {
            try { Field result = type.getDeclaredField(name); result.setAccessible(true); return result; }
            catch (NoSuchFieldException absent) { }
        }
        throw new NoSuchFieldException(name);
    }
    private static Object field(Object owner, String name) throws Exception { return find(owner, name).get(owner); }
    private static void set(Object owner, String name, Object value) throws Exception { find(owner, name).set(owner, value); }
    private Button button(String text) { Button result = search(window.getScene().getRoot(), text); if (result == null) throw new AssertionError("Missing " + text); return result; }
    private Button search(Node node, String text) {
        if (node instanceof Button button && button.getText().equals(text)) return button;
        if (node instanceof Parent parent) for (Node child : parent.getChildrenUnmodifiable()) { Button found = search(child, text); if (found != null) return found; }
        return null;
    }
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void near(double actual, double expected, String message) { require(Math.abs(actual - expected) < 0.00001, message + ": " + actual); }
    public static void main(String[] args) { launch(args); }
}
