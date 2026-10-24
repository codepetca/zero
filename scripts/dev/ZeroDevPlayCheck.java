import java.lang.reflect.Field;
import java.nio.file.Path;
import java.util.EnumSet;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import javafx.application.Platform;
import javafx.event.Event;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyEvent;
import zero.NativeFocus;

/** Plays the actual scratch Main through its input/update/draw loop. No teleporting. */
public final class ZeroDevPlayCheck extends Main {
    private final EnumSet<KeyCode> held = EnumSet.noneOf(KeyCode.class);
    private long started;
    private int frames;
    private boolean restarted;
    private boolean captureWin;
    private boolean expectRestartFocus;

    @Override public void setup() {
        super.setup();
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(25_000); } catch (InterruptedException ignored) { return; }
            System.err.println("ZERO_DEV_PLAY_TIMEOUT frames=" + frames);
            System.exit(1);
        }, "zero-dev-play-deadline");
        watchdog.setDaemon(true);
        watchdog.start();
    }

    @Override public void update(double seconds) {
        try {
            // setup runs before scene measurement and stage.show; time focus only
            // once the visible game's first frame can actually request it.
            if (expectRestartFocus) {
                // showGame from draw commits after the successful frame. Check
                // before NativeFocus can request focus and conceal a regression.
                require(canvas().isFocused(), "Restart returns keyboard focus to canvas by the next frame");
                expectRestartFocus = false;
            }
            if (started == 0) started = System.nanoTime();
            if (!NativeFocus.await(canvas(), started, "sample game keyboard focus")) return;
            super.update(seconds);
            if (seconds > 0) frames++;
            Object[] coins = (Object[]) field(this, Main.class, "coins");
            int points = ((Number) field(this, Main.class, "points")).intValue();
            if (restarted && points == 1) {
                release();
                require(frames > 10, "real animation frames moved the player");
                System.out.println("ZERO_DEV_PLAY_OK arrow-key movement across real frames, three coins, win, Restart, score reset and recollection");
                stop(); canvas().getScene().getWindow().hide(); Platform.exit();
                return;
            }
            if (points == coins.length) {
                release();
                require((boolean) field(this, Main.class, "won"), "all coins trigger win");
                captureWin = true;
                return;
            }
            Object player = field(this, Main.class, "player");
            Object target = coins[points];
            double dx = number(target, "x") - number(player, "x");
            double dy = number(target, "y") - number(player, "y");
            hold(KeyCode.LEFT, dx < -5); hold(KeyCode.RIGHT, dx > 5);
            hold(KeyCode.UP, dy < -5); hold(KeyCode.DOWN, dy > 5);
        } catch (Throwable failure) { fail(failure); }
    }

    @Override public void draw() {
        super.draw();
        if (!captureWin) return;
        captureWin = false;
        try {
            var root = canvas().getScene().getRoot();
            var image = root.snapshot(null, null);
            var pixels = new BufferedImage((int) image.getWidth(), (int) image.getHeight(), BufferedImage.TYPE_INT_ARGB);
            for (int y = 0; y < pixels.getHeight(); y++) for (int x = 0; x < pixels.getWidth(); x++) {
                pixels.setRGB(x, y, image.getPixelReader().getArgb(x, y));
            }
            String proof = System.getenv("ZERO_DEV_PLAY_PROOF");
            require(proof != null && ImageIO.write(pixels, "png", Path.of(proof).toFile()), "win image saved");
            Button restart = button(root);
            require(restart != null, "Restart button exists");
            restart.requestFocus();
            require(restart.isFocused() && !canvas().isFocused(), "Restart owns focus before activation");
            restart.fire();
            require(((Number) field(this, Main.class, "points")).intValue() == 0
                    && !(boolean) field(this, Main.class, "won"), "Restart resets score and win");
            expectRestartFocus = true;
            restarted = true;
        } catch (Throwable failure) { fail(failure); }
    }

    private void hold(KeyCode key, boolean down) {
        if (down ? held.add(key) : held.remove(key)) {
            Event.fireEvent(canvas(), new KeyEvent(down ? KeyEvent.KEY_PRESSED : KeyEvent.KEY_RELEASED,
                    "", "", key, false, false, false, false));
        }
    }
    private void release() { for (KeyCode key : held.clone()) hold(key, false); }
    private static Object field(Object object, Class<?> type, String name) throws Exception {
        Field field = type.getDeclaredField(name); field.setAccessible(true); return field.get(object);
    }
    private static double number(Object object, String name) throws Exception {
        return ((Number) field(object, object.getClass(), name)).doubleValue();
    }
    private static Button button(Node node) {
        if (node instanceof Button value && value.getText().equals("Restart")) return value;
        if (node instanceof Parent parent) for (Node child : parent.getChildrenUnmodifiable()) {
            Button found = button(child); if (found != null) return found;
        }
        return null;
    }
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static void fail(Throwable failure) { failure.printStackTrace(); System.exit(1); }
    public static void main(String[] args) { launch(args); }
}
