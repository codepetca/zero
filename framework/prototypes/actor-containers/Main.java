import zero.Color;
import zero.GameApp;
import zero.contrib.r12345.actor_containers.ActorCollection;
import zero.contrib.r12345.actor_containers.OrderedActors;
import zero.contrib.r12345.actor_containers.SnapshotActors;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;
import zero.ui.Row;

/** One game loop can select either ordinary student-owned container. */
public class Main extends GameApp {
    private ActorCollection actors;
    private CounterActor first, second;
    private boolean snapshot;
    private final Label status = new Label("");
    private final Button pauseButton = new Button("Pause");

    @Override public void settings() {
        title("Zero actor containers");
        size(512, 210);
        padding(12);
    }

    @Override public void setup() {
        Button add = new Button("Add");
        Button remove = new Button("Remove");
        Button change = new Button("Switch");
        Button restart = new Button("Restart");
        add.onClick(() -> { actors.add(second); refreshStatus(); });
        remove.onClick(() -> { actors.remove(second); refreshStatus(); });
        change.onClick(this::switchCollection);
        restart.onClick(this::restart);
        pauseButton.onClick(this::togglePause);
        controls(new Column(8, new Row(add, remove, change, pauseButton, restart), status));
        restart();
    }

    private void restart() {
        first = new CounterActor(Color.BLUE, 160, 90);
        second = new CounterActor(Color.GOLD, 352, 90);
        actors = new OrderedActors();
        actors.add(first); actors.add(second);
        snapshot = false;
        resume();
        pauseButton.setText("Pause");
        refreshStatus();
    }

    private void switchCollection() {
        ActorCollection replacement = snapshot ? new OrderedActors() : new SnapshotActors();
        for (int i = 0; i < actors.size(); i++) replacement.add(actors.get(i));
        actors = replacement;
        snapshot = !snapshot;
        refreshStatus();
    }

    private void togglePause() {
        if (isPaused()) { resume(); pauseButton.setText("Pause"); }
        else { pause(); pauseButton.setText("Resume"); }
    }

    private void refreshStatus() {
        status.setText((snapshot ? "Snapshot array" : "Ordered list") + " | Members: " + actors.size()
                + " | First updates: " + first.updates() + " | Second updates: " + second.updates());
    }

    @Override public void update(double seconds) {
        actors.update(seconds);
        refreshStatus();
    }

    @Override public void draw() {
        background(Color.WHITE);
        actors.draw(this);
        fill(Color.BLACK);
        textCentered("First: " + first.updates(), 160, 145);
        textCentered("Second: " + second.updates() + (actors.contains(second) ? "" : " (removed)"), 352, 145);
        textCentered("Add / Remove changes only the second actor", 256, 185);
    }

    ActorCollection collection() { return actors; }
    CounterActor actor(int index) { return index == 0 ? first : second; }

    public static void main(String[] args) { launch(args); }
}
