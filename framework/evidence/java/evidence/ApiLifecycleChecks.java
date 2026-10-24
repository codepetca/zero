package evidence;

import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.layout.BorderPane;
import javafx.stage.Stage;
import zero.App;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;

/** Actual UI startup, attached content, phase order and idempotent shutdown. */
public final class ApiLifecycleChecks extends ApiProbeBases.Ui {
    private int phase,shutdowns;
    private Stage expectedStage;
    private Label trace;
    public void startChecked(Stage stage) {
        expectedStage=stage;
        ApiProof.pending("zero.App#start(javafx.stage.Stage)","ui-start","Completed startup attaches visible lifecycle content",()->start(stage),"text,Lifecycle component");
        trace.setText(ApiProof.events());
    }
    public void stopChecked() {
        ApiProof.equal("zero.App#stop()","ui-stop","Repeated stop invokes shutdown exactly once",()->{stop();stop();return ""+shutdowns;},"1");
        trace.setText(ApiProof.events());
    }
    @Override public void settings() {
        ApiProof.equal("zero.App#settings()","ui-settings","Settings callback runs before setup with default dimensions",()->{super.settings();return phase+","+ApiProof.number(initialWidth())+","+ApiProof.number(initialHeight());},"0,800,500");
        ApiProof.equal("zero.App#size(double,double)","ui-size","Configured size is retained for both initial dimensions",()->{size(320,200);return ApiProof.number(initialWidth())+","+ApiProof.number(initialHeight());},"320,200");
        ApiProof.equal("zero.App#initialWidth()","ui-initial-width","Protected initial width reports configured pixels",()->ApiProof.number(initialWidth()),"320");
        ApiProof.equal("zero.App#initialHeight()","ui-initial-height","Protected initial height reports configured pixels",()->ApiProof.number(initialHeight()),"200");
        ApiProof.pending("zero.App#title(java.lang.String)","ui-title","Startup applies the configured native or browser title",()->title("Zero API lifecycle"),"title,Zero API lifecycle");
        ApiProof.equal("zero.App#padding(double)","ui-padding-validation","Negative padding is rejected with a useful finite-dimension error",()->{try{padding(-1);return "accepted";}catch(IllegalArgumentException expected){return ""+expected.getMessage().contains("non-negative finite");}},"true");
        phase=1;
    }
    @Override protected Node createContent() {
        ApiProof.equal("zero.App#createContent()","ui-default-content","The default UI content hook returns no implicit node",()->""+(super.createContent()==null),"true");
        return null;
    }
    @Override public void setup() {
        ApiProof.equal("zero.App#setup()","ui-setup","Setup callback follows configured settings",()->{super.setup();return ""+phase;},"1");
        trace=new Label("");Button stop=new Button("Stop UI lifecycle");stop.onClick(this::stopChecked);
        Column content=new Column(new Label("Lifecycle component"),stop,trace);
        ApiProof.pending("zero.App#show(javafx.scene.Node)","ui-show-node","Showing a JavaFX node attaches visible lifecycle content",()->show(content.fxNode()),"text,Lifecycle component");
        ApiProof.pending("zero.App#show(zero.ui.Element)","ui-show-element","Showing an Element keeps the same visible lifecycle content",()->show(content),"text,Lifecycle component");
        phase=2;
    }
    @Override protected Scene createScene(BorderPane content) {
        Scene[] scene=new Scene[1];
        ApiProof.pending("zero.App#createScene(javafx.scene.layout.BorderPane)","ui-create-scene","The returned Scene is attached and displays the supplied content",()->scene[0]=super.createScene(content),"text,Lifecycle component");
        return scene[0];
    }
    @Override protected void ready(Stage stage) {
        ApiProof.equal("zero.App#ready(javafx.stage.Stage)","ui-ready","Ready receives the actual started stage after setup",()->{super.ready(stage);return phase+","+(stage==expectedStage);},"2,true");
        phase=3;
    }
    @Override protected void shutdown() {
        ApiProof.equal("zero.App#shutdown()","ui-shutdown","Shutdown follows ready and is called exactly once",()->{super.shutdown();shutdowns++;return phase+","+shutdowns;},"3,1");
    }
}
