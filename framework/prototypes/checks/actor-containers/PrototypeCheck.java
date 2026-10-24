import javafx.animation.AnimationTimer;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.image.WritableImage;
import javafx.scene.paint.Color;
import javafx.stage.Stage;
import zero.Actor;
import zero.GameApp;
import zero.contrib.r12345.actor_containers.ActorCollection;
import zero.contrib.r12345.actor_containers.OrderedActors;
import zero.contrib.r12345.actor_containers.SnapshotActors;

/** Finite maintainer checks; this JavaFX driver is not part of student sources. */
public final class PrototypeCheck extends Application {
    private int step, pausedUpdates;
    private long since;

    @Override public void start(Stage stage) {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException finished) { return; }
            System.err.println("ZERO_ACTOR_CONTAINERS_PROTOTYPE_TIMEOUT"); System.exit(1);
        }, "zero-actor-containers-deadline");
        watchdog.setDaemon(true); watchdog.start();
        try {
            Main app = new Main(); app.start(stage); app.pause();
            Parent root = stage.getScene().getRoot();
            contractChecks(new OrderedActors(), app);
            contractChecks(new SnapshotActors(), app);
            controlsCheck(app, root);
            // Use the actual button to establish an accurate Resume label.
            click(root, "Restart"); click(root, "Pause");
            pausedUpdates = app.actor(0).updates(); since = System.nanoTime();
            new AnimationTimer() {
                @Override public void handle(long now) {
                    try {
                        if (now - since < 200_000_000L) return;
                        if (step == 0) {
                            require(app.actor(0).updates() == pausedUpdates, "paused real frames do not update actors");
                            click(root, "Resume"); require(!app.isPaused(), "Resume starts the game");
                            step = 1; since = now;
                        } else {
                            require(app.actor(0).updates() > pausedUpdates, "real frames use the selected collection");
                            click(root, "Pause"); require(app.isPaused(), "Pause stops real updates");
                            click(root, "Restart"); app.pause();
                            require(app.actor(0).updates() == 0 && app.actor(1).updates() == 0, "Restart resets counters");
                            require(app.collection() instanceof OrderedActors && app.collection().size() == 2, "Restart restores ordered membership");
                            require(app.actor(0).x() == 160 && app.actor(1).x() == 352
                                    && app.actor(0).rotation() == 0 && app.actor(0).width() == 48, "Restart restores geometry");
                            app.draw(); pixels(app, true);
                            stop(); app.stop(); stage.close();
                            System.out.println("ZERO_ACTOR_CONTAINERS_PROTOTYPE_OK identity/order, add/remove snapshots, exactly-once updates, draw guards, replacement, live pause/resume/restart");
                            Platform.exit();
                        }
                    } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
                }
            }.start();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }

    private static void contractChecks(ActorCollection actors, GameApp app) {
        StringBuilder order = new StringBuilder();
        Probe a = new Probe("a", order), b = new Probe("b", order), c = new Probe("c", order);
        actors.add(a); actors.add(b); actors.add(a);
        require(actors.size() == 2 && actors.get(0) == a && actors.get(1) == b, "unique insertion order");
        actors.remove(c); require(actors.size() == 2, "removing absent actor is harmless");
        for (double bad : new double[] {-1, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            expectArgument(() -> actors.update(bad));
            require(a.updates == 0 && b.updates == 0 && actors.size() == 2, "invalid time rejected before calls/mutation");
        }
        expectArgument(() -> actors.add(null)); expectArgument(() -> actors.remove(null));
        expectArgument(() -> actors.contains(null)); expectArgument(() -> actors.draw(null));
        expectArgument(() -> actors.get(-1)); expectArgument(() -> actors.get(2));
        require(actors.size() == 2 && actors.get(0) == a, "bad references/indices preserve membership");
        actors.update(0); require(order.toString().equals("ab") && a.updates == 1 && b.updates == 1, "zero time calls each actor once in order");
        order.setLength(0);
        a.action = () -> { actors.add(a); actors.add(c); actors.remove(b); };
        actors.update(.25);
        require(order.toString().equals("a") && b.updates == 1 && c.updates == 0, "mid-update add waits and remove skips later actor");
        require(actors.size() == 2 && actors.get(1) == c, "edited membership retains insertion order");
        order.setLength(0); actors.update(.25);
        require(order.toString().equals("ac") && c.updates == 1, "added actor starts next update exactly once");
        order.setLength(0);
        a.action = () -> { actors.remove(c); actors.add(c); };
        actors.update(.25);
        require(order.toString().equals("a") && c.updates == 1, "remove/readd invalidates old frame membership");
        order.setLength(0); actors.update(.25);
        require(order.toString().equals("ac") && c.updates == 2, "readded actor starts following update");
        int beforeA = a.updates, beforeC = c.updates;
        a.action = () -> expectState(() -> actors.update(0));
        actors.update(0);
        require(a.updates == beforeA + 1 && c.updates == beforeC + 1, "recursive update rejected without an extra visit");
        a.action = () -> { throw new IllegalStateException("Expected update failure"); };
        expectState(() -> actors.update(0));
        require(c.updates == beforeC + 1, "failing update stops later visits");
        actors.update(0); require(c.updates == beforeC + 2, "update failure releases guard");
        beforeA = a.updates; beforeC = c.updates;
        a.drawAction = () -> {
            expectState(() -> actors.add(b)); expectState(() -> actors.add(a));
            expectState(() -> actors.remove(c)); expectState(() -> actors.remove(b));
            expectState(() -> actors.update(0)); expectState(() -> actors.draw(app));
        };
        actors.draw(app); actors.draw(app);
        require(a.draws == 2 && c.draws == 2 && a.updates == beforeA && c.updates == beforeC,
                "drawing visits once per call and never advances actors");
        require(actors.size() == 2 && actors.get(1) == c && !actors.contains(b), "drawing rejects membership changes before mutation");
        a.drawAction = () -> { throw new IllegalStateException("Expected draw failure"); };
        expectState(() -> actors.draw(app));
        actors.add(b); actors.remove(b); actors.update(0); actors.draw(app);
        require(c.draws == 3, "draw failure releases edit/update/draw guards");
        int beforeRemoval = c.updates;
        a.action = () -> actors.remove(a);
        actors.update(0); require(actors.size() == 1 && actors.get(0) == c && c.updates == beforeRemoval + 1,
                "self-removal does not skip next actor");
        actors.remove(c);
        EqualProbe first = new EqualProbe(order), second = new EqualProbe(order), absent = new EqualProbe(order);
        actors.add(first); actors.add(second); actors.remove(absent);
        require(first.equals(second) && actors.size() == 2 && !actors.contains(absent), "membership compares identity, not equals");
        actors.remove(first); require(actors.size() == 1 && actors.get(0) == second, "identity removal preserves equal neighbor");
    }

    private static void controlsCheck(Main app, Parent root) {
        CounterActor first = app.actor(0), second = app.actor(1);
        app.update(1);
        require(first.updates() == 1 && second.updates() == 1, "Main has one explicit collection update");
        double[][] before = geometry(app);
        app.draw(); app.draw(); pixels(app, true);
        sameGeometry(app, before);
        require(first.updates() == 1 && second.updates() == 1, "repeated Main drawing observes counters");
        click(root, "Remove"); click(root, "Remove");
        app.update(.25); app.draw(); pixels(app, false);
        require(first.updates() == 2 && second.updates() == 1 && app.collection().size() == 1, "Remove detaches second actor immediately");
        before = geometry(app);
        click(root, "Switch");
        require(app.collection() instanceof SnapshotActors && app.collection().size() == 1 && app.collection().get(0) == first,
                "Switch selects alternative without restoring removed actors");
        sameGeometry(app, before); require(app.isPaused(), "Switch preserves pause");
        click(root, "Add"); click(root, "Add");
        require(app.collection().size() == 2 && app.collection().get(1) == second, "Add restores same actor once");
        app.update(.25);
        require(first.updates() == 3 && second.updates() == 2, "alternative retains counters and update ownership");
        before = geometry(app);
        click(root, "Switch"); sameGeometry(app, before);
        require(app.collection() instanceof OrderedActors && app.actor(0) == first && app.actor(1) == second, "Switch back retains identities");
        app.update(0); require(first.updates() == 4 && second.updates() == 3, "replacement updates each member exactly once");
        app.draw(); pixels(app, true);
    }

    private static class Probe extends Actor {
        private final String name;
        private final StringBuilder order;
        int updates, draws;
        Runnable action, drawAction;
        Probe(String name, StringBuilder order) { super(0, 0); this.name = name; this.order = order; }
        @Override protected void onUpdate(double seconds) {
            updates++; order.append(name);
            Runnable selected = action; action = null;
            if (selected != null) selected.run();
        }
        @Override public void draw(GameApp app) {
            draws++;
            Runnable selected = drawAction; drawAction = null;
            if (selected != null) selected.run();
        }
    }
    private static final class EqualProbe extends Probe {
        EqualProbe(StringBuilder order) { super("equal", order); }
        @Override public boolean equals(Object other) { return other instanceof EqualProbe; }
        @Override public int hashCode() { return 1; }
    }
    private static double[][] geometry(Main app) {
        double[][] result = new double[2][];
        for (int i = 0; i < 2; i++) { Actor a = app.actor(i); result[i] = new double[] {a.x(), a.y(), a.width(), a.height(), a.rotation()}; }
        return result;
    }
    private static void sameGeometry(Main app, double[][] before) {
        double[][] after = geometry(app);
        for (int i = 0; i < 2; i++) for (int j = 0; j < 5; j++) require(before[i][j] == after[i][j], "replacement retains geometry");
    }
    private static void pixels(Main app, boolean secondPresent) {
        WritableImage image = app.canvas().snapshot(null, null);
        require(image.getPixelReader().getColor(160, 80).equals(Color.BLUE), "first actor visible");
        require(image.getPixelReader().getColor(352, 80).equals(secondPresent ? Color.GOLD : Color.WHITE), "second membership visible");
    }
    private static void expectArgument(Runnable action) {
        try { action.run(); throw new AssertionError("Invalid argument accepted"); }
        catch (IllegalArgumentException expected) { require(expected.getMessage() != null && !expected.getMessage().isBlank(), "useful argument error"); }
    }
    private static void expectState(Runnable action) {
        try { action.run(); throw new AssertionError("Invalid call accepted"); }
        catch (IllegalStateException expected) { require(expected.getMessage() != null && !expected.getMessage().isBlank(), "useful state error"); }
    }
    private static void click(Parent root, String text) { Button button = button(root, text); require(button != null, "button exists: " + text); button.fire(); }
    private static Button button(Parent root, String text) {
        for (Node node : root.getChildrenUnmodifiable()) {
            if (node instanceof Button button && button.getText().equals(text)) return button;
            if (node instanceof Parent parent) { Button found = button(parent, text); if (found != null) return found; }
        }
        return null;
    }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) { launch(args); }
}
