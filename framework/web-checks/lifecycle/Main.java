import evidence.ApiProof;
import evidence.ApiSignatureChecks;
import evidence.ApiDrawingChecks;
import evidence.ApiLifecycleChecks;
import evidence.ApiCompletionChecks;
import evidence.ApiProbeBases;
import zero.ui.Label;
import javafx.scene.image.Image;
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
            button("Check UI lifecycle",() -> new ApiLifecycleChecks().startChecked(stage)),
            button("Start game",() -> {Host host=new Host();ApiCompletionChecks.gameStart(host,stage,960,480);ApiCompletionChecks.showGame(host);}),
            button("Fault setup",() -> new SetupFailure().start(stage)),
            button("Fault shutdown",() -> { ShutdownFailure failure=new ShutdownFailure(); failure.start(stage); failure.stop(); })));
    }
    @Override protected void ready(Stage stage) { this.stage=stage; }
    private static final class SetupFailure extends ApiProbeBases.Ui {
        @Override public void setup() { throw new IllegalStateException("Lifecycle setup fault"); }
    }
    private static final class ShutdownFailure extends ApiProbeBases.Ui {
        @Override public void setup() { show(new zero.ui.Label("Shutdown fixture ready")); }
        @Override protected void shutdown() { throw new IllegalStateException("Lifecycle shutdown fault"); }
    }
    private static final class Host extends ApiProbeBases.Game {
        private int updates,draws;
        private final Label trace=new Label("");
        private Image sheet;
        private boolean painted;
        private boolean updateFault,drawFault;
        @Override public void settings() { title("Zero lifecycle game"); size(960,480); padding(0); }
        @Override public void setup() {
            ApiSignatureChecks.host(this,960,480);
            sheet=loadImage("/tiles.png");
            ApiCompletionChecks.gameControls(this,new Column(4,
                button("Stop lifecycle game",() -> {ApiCompletionChecks.stopGame(this);trace.setText(ApiProof.events());}),
                button("Fault update",() -> updateFault=true),
                button("Fault draw",() -> drawFault=true),
                button("Fault UI",() -> { throw new IllegalStateException("Lifecycle UI fault"); }),
                button("Fault missing asset",() -> loadImage("/missing-lifecycle-image.png")),trace),"Fault update");
            show(new Label("Lifecycle waiting"));
        }
        @Override public void update(double seconds) { if(updateFault)throw new IllegalStateException("Lifecycle update fault"); updates++;if(updates==1)ApiProof.equal("zero.GameApp#update(double)","game-update","The first actual update callback receives zero elapsed time",()->{super.update(seconds);return ApiProof.number(seconds);},"0"); }
        @Override public void draw() {
            if(drawFault)throw new IllegalStateException("Lifecycle draw fault");
            draws++;if(draws==1)ApiProof.equal("zero.GameApp#draw()","game-draw","The first actual draw follows exactly one update callback",()->{super.draw();return updates+","+draws;},"1,1");
            ApiDrawingChecks.paint(this,sheet,!painted); painted=true;
            fill(Color.BLACK);
            text("Lifecycle evidence ready",10,25); text("Updates: " + updates,10,55);text("Draws: "+draws,170,55);
            text(ApiProof.events(),-10000,-10000);
        }
    }
    public static void main(String[] args) { launch(args); }
}
