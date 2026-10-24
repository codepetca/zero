package evidence;

import javafx.scene.image.Image;
import zero.Actor;
import zero.AnimationPlayback;
import zero.AnimationSource;
import zero.App;
import zero.Collisions;
import zero.Color;
import zero.GameApp;
import zero.ImageRegion;
import zero.Key;
import zero.Music;
import zero.Sound;
import zero.SpriteAnimation;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Element;
import zero.ui.Label;
import zero.ui.Row;
import zero.ui.TextField;

/** Direct Java calls and observed postconditions shared by native/browser checks.
 * These sources are verification fixtures, never part of a student kit or API. */
public final class ApiSignatureChecks {
    private ApiSignatureChecks() { }
    private static void eq(String signature, String assertion, String postcondition,
            ApiProof.Invocation call, String expected) {
        ApiProof.equal(signature,assertion,postcondition,call,expected);
    }
    private static String geometry(Actor actor) {
        return actor.x() + "," + actor.y() + "," + actor.width() + "," + actor.height();
    }
    private static final class Mover extends Actor {
        int hooks;
        Mover(AnimationSource source) { super(source,10,20); }
        @Override protected void onUpdate(double seconds) { hooks++; move(seconds,0); }
    }

    public static void actors(Image image,double imageWidth,double imageHeight) {
        ImageRegion first = new ImageRegion(image,0,0,1,1), second = new ImageRegion(image,1,0,1,1);
        SpriteAnimation source = new SpriteAnimation(2,first,second);
        eq("zero.Actor#<init>(double,double)","actor-empty","Empty construction preserves centre and one-pixel logical size",()->geometry(new Actor(10,20)),"10.0,20.0,1.0,1.0");
        eq("zero.Actor#<init>(javafx.scene.image.Image,double,double)","actor-image","Image construction uses natural dimensions",()->geometry(new Actor(image,10,20)),"10.0,20.0,"+imageWidth+","+imageHeight);
        eq("zero.Actor#<init>(zero.ImageRegion,double,double)","actor-region","Region construction uses region dimensions",()->geometry(new Actor(first,10,20)),"10.0,20.0,1.0,1.0");
        eq("zero.Actor#<init>(zero.SpriteAnimation,double,double)","actor-sprite","Sprite construction uses initial playback dimensions",()->geometry(new Actor(source,10,20)),"10.0,20.0,1.0,1.0");
        AnimationSource definition = source;
        eq("zero.Actor#<init>(zero.AnimationSource,double,double)","actor-source","Source construction uses initial playback dimensions",()->geometry(new Actor(definition,10,20)),"10.0,20.0,1.0,1.0");
        Actor actor = new Actor(10,20);
        eq("zero.Actor#x()","actor-x","Horizontal centre is readable",()->""+actor.x(),"10.0");
        eq("zero.Actor#y()","actor-y","Vertical centre is readable",()->""+actor.y(),"20.0");
        eq("zero.Actor#width()","actor-width","Logical width starts at one",()->""+actor.width(),"1.0");
        eq("zero.Actor#height()","actor-height","Logical height starts at one",()->""+actor.height(),"1.0");
        eq("zero.Actor#rotation()","actor-rotation","Initial rotation faces right",()->""+actor.rotation(),"0.0");
        eq("zero.Actor#setPosition(double,double)","actor-position","Setting centre preserves logical size",()->{actor.setPosition(2,3);return geometry(actor);},"2.0,3.0,1.0,1.0");
        eq("zero.Actor#setSize(double,double)","actor-size","Display dimensions change without moving centre",()->{actor.setSize(4,6);return geometry(actor);},"2.0,3.0,4.0,6.0");
        eq("zero.Actor#setRotation(double)","actor-wrap","Negative rotation normalizes into a positive turn",()->{actor.setRotation(-90);return ""+actor.rotation();},"270.0");
        eq("zero.Actor#rotate(double)","actor-turn","Relative turn wraps across zero",()->{actor.rotate(90);return ""+actor.rotation();},"0.0");
        eq("zero.Actor#move(double,double)","actor-move","Pixel deltas change both coordinates",()->{actor.move(3,-1);return actor.x()+","+actor.y();},"5.0,2.0");
        eq("zero.Actor#moveForward(double,double)","actor-forward","Signed speed times elapsed time follows heading",()->{actor.moveForward(8,.5);return actor.x()+","+actor.y();},"9.0,2.0");
        eq("zero.Actor#face(double,double)","actor-face","Facing a point below yields clockwise ninety degrees",()->{actor.face(9,12);return ""+actor.rotation();},"90.0");
        eq("zero.Actor#moveToward(double,double,double,double)","actor-clamp","Approach stops at target without overshoot",()->{actor.moveToward(9,12,100,1);return actor.x()+","+actor.y();},"9.0,12.0");
        eq("zero.Actor#setImage(javafx.scene.image.Image)","actor-static-image","Static replacement preserves explicit geometry",()->{actor.setImage(image);return geometry(actor);},"9.0,12.0,4.0,6.0");
        eq("zero.Actor#setImage(zero.ImageRegion)","actor-static-region","Region replacement preserves explicit geometry",()->{actor.setImage(first);return geometry(actor);},"9.0,12.0,4.0,6.0");
        eq("zero.Actor#setImage(zero.SpriteAnimation)","actor-set-sprite","Assigning sprite keeps geometry and legacy clock",()->{actor.setImage(source);actor.update(.5);return geometry(actor)+","+source.frameIndex();},"9.0,12.0,4.0,6.0,0");
        eq("zero.Actor#setImage(zero.AnimationSource)","actor-set-source","Source replacement preserves geometry without ticking source",()->{actor.setImage(definition);return geometry(actor)+","+source.frameIndex();},"9.0,12.0,4.0,6.0,0");
        Mover mover = new Mover(source);
        eq("zero.Actor#update(double)","actor-update-owner","One explicit update invokes behaviour once with elapsed time",()->{mover.update(.5);return mover.hooks+","+mover.x();},"1,10.5");
        eq("zero.Actor#onUpdate(double)","actor-behaviour-hook","Protected behaviour receives validated time on next update",()->{mover.update(.25);return mover.hooks+","+mover.x();},"2,10.75");
        eq("zero.ImageRegion#<init>(javafx.scene.image.Image,double,double,double,double)","region-construction","Region retains exact supplied bounds",()->{ImageRegion r=new ImageRegion(image,1,0,1,1);return r.x()+","+r.y()+","+r.width()+","+r.height();},"1.0,0.0,1.0,1.0");
        eq("zero.ImageRegion#image()","region-image","Region borrows the original image identity",()->""+(first.image()==image),"true");
        eq("zero.ImageRegion#x()","region-x","Horizontal atlas offset is readable",()->""+second.x(),"1.0");
        eq("zero.ImageRegion#y()","region-y","Vertical atlas offset is readable",()->""+second.y(),"0.0");
        eq("zero.ImageRegion#width()","region-width","Atlas width is readable",()->""+second.width(),"1.0");
        eq("zero.ImageRegion#height()","region-height","Atlas height is readable",()->""+second.height(),"1.0");
        eq("zero.SpriteAnimation#<init>(double,zero.ImageRegion...)","sprite-sequence","Explicit sequence retains both frame identities",()->{SpriteAnimation s=new SpriteAnimation(2,first,second);return (s.frame()==first)+","+s.frameCount();},"true,2");
        eq("zero.SpriteAnimation#<init>(javafx.scene.image.Image,int,int,double)","sprite-grid","Grid construction divides the supplied image into two frames",()->{SpriteAnimation s=new SpriteAnimation(image,2,1,4);return s.frame().width()+","+s.frameCount();},imageWidth/2+",2");
        eq("zero.SpriteAnimation#columns()","sprite-columns","Explicit sequence is one row with two columns",()->""+source.columns(),"2");
        eq("zero.SpriteAnimation#rows()","sprite-rows","Explicit sequence reports one row",()->""+source.rows(),"1");
        eq("zero.SpriteAnimation#fps()","sprite-fps","Configured frame rate remains readable",()->""+source.fps(),"2.0");
        eq("zero.SpriteAnimation#frameCount()","sprite-count","Frame count is exact",()->""+source.frameCount(),"2");
        eq("zero.SpriteAnimation#image()","sprite-image","Animation borrows original backing image",()->""+(source.image()==image),"true");
        eq("zero.SpriteAnimation#frame()","sprite-frame","Initial legacy frame is first region",()->""+(source.frame()==first),"true");
        eq("zero.SpriteAnimation#update(double)","sprite-advance","Half a second advances exactly one frame at two fps",()->{source.update(.5);return ""+(source.frame()==second);},"true");
        eq("zero.SpriteAnimation#frameIndex()","sprite-index","Advanced frame has zero-based index one",()->""+source.frameIndex(),"1");
        eq("zero.SpriteAnimation#reset()","sprite-reset","Reset restores frame zero and fractional clock",()->{source.reset();source.update(.25);return ""+source.frameIndex();},"0");
        eq("zero.SpriteAnimation#createPlayback()","sprite-factory","Each Sprite factory call returns independent initial playback",()->""+(source.createPlayback()!=source.createPlayback()),"true");
        AnimationPlayback clock=definition.createPlayback(),other=definition.createPlayback();
        eq("zero.AnimationSource#createPlayback()","source-factory","Interface factory returns independent frame-zero clocks",()->""+(definition.createPlayback()!=clock&&clock.frame()==first&&other.frame()==first),"true");
        eq("zero.AnimationPlayback#update(double)","playback-advance","Advancing one owner leaves the other at its initial frame",()->{clock.update(.5);return (clock.frame()==second)+","+(other.frame()==first);},"true,true");
        eq("zero.AnimationPlayback#frame()","playback-observe","Repeated frame reads observe the same selected region",()->""+(clock.frame()==second&&clock.frame()==second),"true");
        eq("zero.Collisions#rectHitsRect(double,double,double,double,double,double,double,double)","collision-rect","Touching rectangle edges count as contact",()->""+Collisions.rectHitsRect(0,0,2,2,2,0,2,2),"true");
        eq("zero.Collisions#circleHitsCircle(double,double,double,double,double,double)","collision-circle","Separated circle boundaries do not collide",()->""+Collisions.circleHitsCircle(0,0,1,3,0,1),"false");
        eq("zero.Collisions#circleHitsRect(double,double,double,double,double,double,double)","collision-mixed","Circle touching the near rectangle edge collides",()->""+Collisions.circleHitsRect(0,0,1,1,-1,2,2),"true");
    }

    public static void ui() {
        eq("zero.ui.Label#<init>(java.lang.String)","label-construct","Constructor retains supplied label text",()->new Label("Before").getText(),"Before");
        Label label=new Label("Before");
        eq("zero.ui.Label#setText(java.lang.String)","label-change","Changing label replaces displayed text",()->{label.setText("After");return label.getText();},"After");
        eq("zero.ui.Label#getText()","label-read","Getter returns latest text",label::getText,"After");
        eq("zero.ui.Button#<init>(java.lang.String)","button-construct","Constructor retains button text",()->new Button("Go").getText(),"Go");
        Button button=new Button("Before");
        eq("zero.ui.Button#setText(java.lang.String)","button-change","Setter changes button text",()->{button.setText("After");return button.getText();},"After");
        eq("zero.ui.Button#getText()","button-read","Getter returns latest button text",button::getText,"After");
        eq("zero.ui.TextField#<init>()","field-construct","New text field starts empty",()->new TextField().getText(),"");
        TextField field=new TextField();
        eq("zero.ui.TextField#setText(java.lang.String)","field-change","Programmatic text changes are readable",()->{field.setText("Ada");return field.getText();},"Ada");
        eq("zero.ui.TextField#getText()","field-read","Text getter returns latest input",field::getText,"Ada");
        eq("zero.ui.TextField#setPromptText(java.lang.String)","field-prompt-change","Prompt can change without altering field value",()->{field.setPromptText("Name");return field.getPromptText()+","+field.getText();},"Name,Ada");
        eq("zero.ui.TextField#getPromptText()","field-prompt-read","Prompt getter returns latest prompt",field::getPromptText,"Name");
        eq("zero.ui.Column#<init>(zero.ui.Element...)","column-default","Default spacing is eight pixels",()->""+new Column(new Label("A")).getSpacing(),"8.0");
        eq("zero.ui.Column#<init>(double,zero.ui.Element...)","column-explicit","Constructor preserves explicit spacing",()->""+new Column(6,new Label("B")).getSpacing(),"6.0");
        Column column=new Column();
        eq("zero.ui.Column#setSpacing(double)","column-change","Setter updates column spacing",()->{column.setSpacing(12);return ""+column.getSpacing();},"12.0");
        eq("zero.ui.Column#getSpacing()","column-read","Spacing getter returns latest value",()->""+column.getSpacing(),"12.0");
        eq("zero.ui.Row#<init>(zero.ui.Element...)","row-default","Default row spacing is eight pixels",()->""+new Row(new Label("A")).getSpacing(),"8.0");
        eq("zero.ui.Row#<init>(double,zero.ui.Element...)","row-explicit","Constructor preserves explicit row spacing",()->""+new Row(6,new Label("B")).getSpacing(),"6.0");
        Row row=new Row();
        eq("zero.ui.Row#setSpacing(double)","row-change","Setter updates row spacing",()->{row.setSpacing(12);return ""+row.getSpacing();},"12.0");
        eq("zero.ui.Row#getSpacing()","row-read","Spacing getter returns latest row value",()->""+row.getSpacing(),"12.0");
        eq("zero.ui.Element#fxNode()","element-node","Repeated advanced bridge returns the same backing node",()->""+(label.fxNode()!=null&&label.fxNode()==label.fxNode()),"true");
        // setEnabled and callbacks require real input dispatch; their existing
        // native/browser interaction checks are not replaced by setter-only proof.
        eq("zero.Color#rgb(int,int,int)","color-range","Out-of-range RGB is rejected before a color is returned",()->{try{Color.rgb(256,0,0);return "accepted";}catch(IllegalArgumentException expected){return "rejected";}},"rejected");
    }

    public static void host(GameApp app,double width,double height) {
        eq("zero.GameApp#width()","canvas-width","Canvas width matches settings",()->""+app.width(),""+width);
        eq("zero.GameApp#height()","canvas-height","Canvas height matches settings",()->""+app.height(),""+height);
        eq("zero.GameApp#canvas()","canvas-identity","Live canvas escape hatch preserves identity",()->""+(app.canvas()!=null&&app.canvas()==app.canvas()),"true");
        eq("zero.GameApp#graphics()","graphics-identity","Live drawing context preserves identity",()->""+(app.graphics()!=null&&app.graphics()==app.graphics()),"true");
        eq("zero.GameApp#layout()","layout-identity","Retained layout preserves identity",()->""+(app.layout()!=null&&app.layout()==app.layout()),"true");
        eq("zero.GameApp#pause()","host-pause","Pause sets explicit paused state",()->{app.pause();return ""+app.isPaused();},"true");
        eq("zero.GameApp#isPaused()","host-paused","Paused state is readable",()->""+app.isPaused(),"true");
        eq("zero.GameApp#resume()","host-resume","Resume clears explicit paused state",()->{app.resume();return ""+app.isPaused();},"false");
    }

    public static void audio(App app,String resource) {
        Sound sound=app.loadSound(resource);Music music=app.loadMusic(resource);
        eq("zero.App#loadSound(java.lang.String)","sound-cache","Repeated load borrows same app-owned sound",()->""+(app.loadSound(resource)==sound),"true");
        eq("zero.App#loadMusic(java.lang.String)","music-independent","Repeated load creates an independent music owner",()->{Music other=app.loadMusic(resource);boolean independent=other!=music;other.close();return ""+independent;},"true");
        eq("zero.Sound#setVolume(double)","sound-volume-change","Volume changes remain readable",()->{sound.setVolume(.25);return ""+sound.getVolume();},"0.25");
        eq("zero.Sound#getVolume()","sound-volume-read","Sound getter returns selected volume",()->""+sound.getVolume(),"0.25");
        eq("zero.Sound#setMuted(boolean)","sound-mute-change","Mute changes remain readable",()->{sound.setMuted(true);return ""+sound.isMuted();},"true");
        eq("zero.Sound#isMuted()","sound-mute-read","Sound getter returns selected mute state",()->""+sound.isMuted(),"true");
        eq("zero.Sound#close()","sound-close","Closing rejects further playback controls",()->{sound.close();try{sound.play();return "accepted";}catch(IllegalStateException expected){return "closed";}},"closed");
        eq("zero.Sound#isPlaying()","sound-closed-playing","Closed sound cannot still be playing",()->""+sound.isPlaying(),"false");
        eq("zero.Music#setVolume(double)","music-volume-change","Music volume changes remain readable",()->{music.setVolume(.25);return ""+music.getVolume();},"0.25");
        eq("zero.Music#getVolume()","music-volume-read","Music getter returns selected volume",()->""+music.getVolume(),"0.25");
        eq("zero.Music#setMuted(boolean)","music-mute-change","Music mute changes remain readable",()->{music.setMuted(true);return ""+music.isMuted();},"true");
        eq("zero.Music#isMuted()","music-mute-read","Music getter returns selected mute state",()->""+music.isMuted(),"true");
        eq("zero.Music#close()","music-close","Closing rejects later music controls",()->{music.close();try{music.play();return "accepted";}catch(IllegalStateException expected){return "closed";}},"closed");
        eq("zero.Music#isPlaying()","music-closed-playing","Closed music cannot still be playing",()->""+music.isPlaying(),"false");
        // Playing, looping, pause/rewind and autoplay need timed actual-media
        // postconditions from AudioCheck and the browser's existing click flow.
    }
}
