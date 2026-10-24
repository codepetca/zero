import evidence.ApiProof;
import evidence.ApiSignatureChecks;
import javafx.stage.Stage;
import zero.App;
import zero.Color;
import zero.GameApp;
import zero.ui.Button;
import zero.ui.Column;

/** Maintainer-only finite lifecycle/error fixture. Each fault uses a fresh page. */
public final class Main extends App {
    private Stage stage;
    private static Button button(String text,Runnable action) { Button button=new Button(text); button.onClick(action); return button; }
    @Override public void settings() { title("Zero lifecycle evidence"); size(480,300); padding(0); }
    @Override public void setup() {
        show(new Column(8,
            button("Start game",() -> new Host().start(stage)),
            button("Fault setup",() -> new SetupFailure().start(stage)),
            button("Fault shutdown",() -> { ShutdownFailure failure=new ShutdownFailure(); failure.start(stage); failure.stop(); })));
    }
    @Override protected void ready(Stage stage) { this.stage=stage; }
    private static final class SetupFailure extends App {
        @Override public void setup() { throw new IllegalStateException("Lifecycle setup fault"); }
    }
    private static final class ShutdownFailure extends App {
        @Override public void setup() { show(new zero.ui.Label("Shutdown fixture ready")); }
        @Override protected void shutdown() { throw new IllegalStateException("Lifecycle shutdown fault"); }
    }
    private static final class Host extends GameApp {
        private int updates;
        private boolean updateFault,drawFault;
        @Override public void settings() { title("Zero lifecycle game"); size(480,300); padding(0); }
        @Override public void setup() {
            ApiSignatureChecks.host(this,480,300);
            layout().setBottom(new Column(4,
                button("Fault update",() -> updateFault=true),
                button("Fault draw",() -> drawFault=true),
                button("Fault UI",() -> { throw new IllegalStateException("Lifecycle UI fault"); }),
                button("Fault missing asset",() -> loadImage("/missing-lifecycle-image.png"))).fxNode());
        }
        @Override public void update(double seconds) { if(updateFault)throw new IllegalStateException("Lifecycle update fault"); updates++; }
        @Override public void draw() {
            if(drawFault)throw new IllegalStateException("Lifecycle draw fault");
            background(Color.WHITE); fill(Color.BLACK);
            text("Lifecycle evidence ready",10,25); text("Updates: " + updates,10,55);
            text(ApiProof.events(),-10000,-10000);
        }
    }
    public static void main(String[] args) { launch(args); }
}
