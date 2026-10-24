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
import zero.AnimationPlayback;
import zero.AnimationSource;
import zero.ImageRegion;
import zero.SpriteAnimation;
import zero.contrib.r12345.actor_tools.TurnTowards;

/** Maintainer-only finite interaction and pixel checks; never part of student sources. */
public final class PrototypeCheck extends Application {
    private int step;
    private long since;
    private double pausedRotation;

    @Override public void start(Stage stage) {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException finished) { return; }
            System.err.println("ZERO_ACTOR_COMPONENTS_PROTOTYPE_TIMEOUT"); System.exit(1);
        }, "zero-actor-components-deadline");
        watchdog.setDaemon(true); watchdog.start();
        try {
            Main app = new Main(); app.start(stage); app.pause();
            Parent root = stage.getScene().getRoot();
            steeringChecks(); playbackChecks(app);
            app.draw(); colors(app, Color.rgb(20,170,70), Color.rgb(220,40,40));
            app.draw(); colors(app, Color.rgb(20,170,70), Color.rgb(220,40,40));
            double[][] geometry = geometry(app);
            click(root,"Once"); sameGeometry(app,geometry);
            require(app.isPaused(),"source replacement retains pause");
            app.draw(); colors(app, Color.rgb(20,170,70), Color.rgb(220,40,40));
            app.update(10); app.draw(); colors(app, Color.rgb(40,90,230), Color.rgb(40,90,230));
            geometry = geometry(app);
            click(root,"Static image"); sameGeometry(app,geometry);
            app.update(1); app.draw(); colors(app,Color.rgb(220,40,40),Color.rgb(220,40,40));
            geometry = geometry(app);
            click(root,"Procedural"); sameGeometry(app,geometry);
            app.update(1); app.draw(); colors(app,Color.GOLD,Color.GOLD);
            geometry = geometry(app);
            click(root,"Loop"); sameGeometry(app,geometry);
            app.draw(); colors(app,Color.rgb(20,170,70),Color.rgb(220,40,40));
            require(app.isPaused(),"all image/shape/source callbacks retain pause");
            click(root,"Restart"); app.pause();
            pausedRotation=app.actor(0).rotation(); since=System.nanoTime();
            new AnimationTimer() {
                @Override public void handle(long now) {
                    try {
                        if (now-since<200_000_000L) return;
                        if (step==0) {
                            require(app.actor(0).rotation()==pausedRotation,"paused real frames do not turn actors");
                            // The label is Pause because the maintainer paused directly.
                            click(root,"Pause"); require(!app.isPaused(),"Pause callback toggles paused app to running");
                            pausedRotation=app.actor(0).rotation(); step=1; since=now;
                        } else {
                            require(app.actor(0).rotation()!=pausedRotation,"real game frames use the turning helper");
                            click(root,"Pause"); require(app.isPaused(),"Pause callback stops live updates");
                            click(root,"Restart"); app.pause();
                            require(app.actor(0).x()==160&&app.actor(1).x()==352&&app.actor(0).rotation()==0,"Restart restores actor geometry");
                            require(app.actor(0).width()==64&&app.actor(1).height()==64,"Restart restores display sizes");
                            app.draw(); colors(app,Color.rgb(20,170,70),Color.rgb(220,40,40));
                            stop(); app.stop(); stage.close();
                            System.out.println("ZERO_ACTOR_COMPONENTS_PROTOTYPE_OK independent clocks, once/static/procedural swaps, geometry, steering, cached drawing, live pause/resume/restart");
                            Platform.exit();
                        }
                    } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
                }
            }.start();
        } catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
    }

    private static void playbackChecks(Main app) {
        ImageRegion[] original={app.frame(0),app.frame(1),app.frame(2)};
        OnceAnimation source=new OnceAnimation(4,original); original[0]=app.frame(2);
        AnimationPlayback first=source.createPlayback(),second=source.createPlayback();
        require(first!=second&&first.frame()==app.frame(0),"fresh playback objects and defensive frame-array copy");
        first.update(0.25);require(first.frame()==app.frame(1)&&second.frame()==app.frame(0),"one one-shot clock advances independently");
        first.update(Double.MAX_VALUE);require(first.frame()==app.frame(2),"huge finite time clamps to final frame");
        first.update(1);require(first.frame()==app.frame(2),"one-shot final frame remains stable");
        for(double bad:new double[]{-1,Double.NaN,Double.POSITIVE_INFINITY}){expectArgument(()->second.update(bad));require(second.frame()==app.frame(0),"invalid time preserves clock");}
        SpriteAnimation loop=new SpriteAnimation(4,app.frame(0),app.frame(1),app.frame(2));
        AnimationPlayback a=loop.createPlayback(),b=loop.createPlayback();a.update(0.25);loop.update(0.5);
        require(a!=b&&a.frame()==app.frame(1)&&b.frame()==app.frame(0)&&loop.frame()==app.frame(2),"sprite owner clocks and legacy clock are separate");
        AnimationSource coupled=()->first;
        try { requireFresh(coupled); throw new AssertionError("shared playback must fail conformance"); }
        catch (IllegalStateException expected) { require(expected.getMessage().contains("fresh"),"useful source conformance failure"); }
        AnimationSource badFrame=()->new AnimationPlayback(){boolean invalid;public void update(double seconds){invalid=true;}public ImageRegion frame(){return invalid?null:app.frame(0);}};
        Actor bad=new Actor(badFrame,30,30);
        try {bad.update(0.25);throw new AssertionError("null playback frame accepted");}
        catch(IllegalStateException expected){require(expected.getMessage().contains("frame"),"bad frame fails with a useful contract message");}
    }
    private static void requireFresh(AnimationSource source) {
        if(source.createPlayback()==source.createPlayback())throw new IllegalStateException("Animation sources must create fresh playback clocks.");
    }
    private static void steeringChecks() {
        Actor actor=new Actor(0,0);
        actor.setRotation(350);TurnTowards.apply(actor,1,0,5,1);near(actor.rotation(),355,"shortest turn crosses zero clockwise");
        actor.setRotation(10);TurnTowards.apply(actor,1,0,5,1);near(actor.rotation(),5,"shortest turn crosses zero counterclockwise");
        actor.setRotation(0);TurnTowards.apply(actor,-1,0,45,1);near(actor.rotation(),315,"half-turn tie goes counterclockwise");
        actor.setRotation(350);TurnTowards.apply(actor,1,0,500,1);near(actor.rotation(),0,"turn does not overshoot");
        actor.setPosition(-Double.MAX_VALUE,-Double.MAX_VALUE);actor.setRotation(0);TurnTowards.apply(actor,Double.MAX_VALUE,Double.MAX_VALUE,360,1);near(actor.rotation(),45,"finite extremes do not overflow subtraction");
        actor.setPosition(Double.MIN_VALUE,Double.MAX_VALUE);actor.setRotation(90);TurnTowards.apply(actor,0,Double.MAX_VALUE,360,1);near(actor.rotation(),180,"equal huge axis preserves tiny other-axis direction");
        actor.setPosition(0,0);actor.setRotation(37);TurnTowards.apply(actor,0,0,20,2);TurnTowards.apply(actor,1,1,0,2);TurnTowards.apply(actor,1,1,20,0);near(actor.rotation(),37,"coincident target and zero turn preserve heading");
        for(double bad:new double[]{Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY}) {
            expectArgument(()->TurnTowards.apply(actor,bad,1,1,1));expectArgument(()->TurnTowards.apply(actor,1,bad,1,1));expectArgument(()->TurnTowards.apply(actor,1,1,bad,1));expectArgument(()->TurnTowards.apply(actor,1,1,1,bad));
        }
        expectArgument(()->TurnTowards.apply(actor,1,1,-1,1));expectArgument(()->TurnTowards.apply(actor,1,1,1,-1));expectArgument(()->TurnTowards.apply(actor,1,1,Double.MAX_VALUE,2));expectArgument(()->TurnTowards.apply(null,1,1,1,1));
        near(actor.rotation(),37,"all invalid inputs preserve heading");require(actor.x()==0&&actor.y()==0,"turning never moves actor position");
    }
    private static double[][] geometry(Main app){double[][] result=new double[2][];for(int i=0;i<2;i++){Actor a=app.actor(i);result[i]=new double[]{a.x(),a.y(),a.width(),a.height(),a.rotation()};}return result;}
    private static void sameGeometry(Main app,double[][] before){double[][] after=geometry(app);for(int i=0;i<2;i++)for(int j=0;j<5;j++)require(before[i][j]==after[i][j],"presentation swap preserves geometry");}
    private static void colors(Main app,Color first,Color second){WritableImage image=app.canvas().snapshot(null,null);require(image.getPixelReader().getColor((int)app.actor(0).x(),(int)app.actor(0).y()).equals(first),"first actor frame center");require(image.getPixelReader().getColor((int)app.actor(1).x(),(int)app.actor(1).y()).equals(second),"second actor frame center");}
    private static void expectArgument(Runnable action){try{action.run();throw new AssertionError("invalid input accepted");}catch(IllegalArgumentException expected){require(expected.getMessage()!=null&&!expected.getMessage().isBlank(),"useful argument error");}}
    private static void near(double actual,double expected,String message){require(Math.abs(actual-expected)<1e-9,message+": "+actual);}
    private static void click(Parent root,String text){Button button=button(root,text);require(button!=null,"button exists: "+text);button.fire();}
    private static Button button(Parent root,String text){for(Node node:root.getChildrenUnmodifiable()){if(node instanceof Button b&&b.getText().equals(text))return b;if(node instanceof Parent p){Button result=button(p,text);if(result!=null)return result;}}return null;}
    private static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    public static void main(String[] args){launch(args);}
}
