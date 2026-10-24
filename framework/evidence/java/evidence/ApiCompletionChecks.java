package evidence;

import javafx.stage.Stage;
import zero.GameApp;
import zero.Music;
import zero.Sound;
import zero.ui.Button;
import zero.ui.Element;

/** Real calls whose later frame, input or media effects complete the assertion. */
public final class ApiCompletionChecks {
    private ApiCompletionChecks() { }
    private static boolean playMusic,loopMusic,pauseMusic,stopMusic,playSound,stopSound,disabled;
    public static void gameStart(GameApp app,Stage stage,double width,double height) {
        // App.start necessarily invokes these final GameApp hooks. The canvas,
        // attached Scene and subsequent real frames establish their completion.
        ApiProof.pending("zero.GameApp#ready(javafx.stage.Stage)","game-ready","Ready starts a timer that delivers real update and draw callbacks",()->
            ApiProof.pending("zero.GameApp#createScene(javafx.scene.layout.BorderPane)","game-scene","The created Scene attaches the configured game canvas",()->
                ApiProof.equal("zero.GameApp#createContent()","game-content","Content creation constructs a canvas and drawing context with configured dimensions",()->{app.start(stage);return (app.canvas()!=null&&app.graphics()!=null&&app.layout()!=null)+","+app.width()+","+app.height();},"true,"+width+","+height),"canvas,"+width+","+height),"frames");
    }
    public static void gameControls(GameApp app,Element content,String visibleText) {
        ApiProof.pending("zero.GameApp#controls(zero.ui.Element)","game-controls","Mounted controls remain visible beside the running canvas",()->app.controls(content),"text,"+visibleText);
    }
    public static void showGame(GameApp app) {
        ApiProof.pending("zero.GameApp#showGame()","game-show","Returning from a retained UI view resumes real game frames",app::showGame,"frames");
    }
    public static void stopGame(GameApp app) {
        ApiProof.pending("zero.GameApp#shutdown()","game-shutdown","Shutdown stops all subsequent game update and draw work",app::stop,"stopped-frames");
    }
    public static void action(Button button,Runnable action) {
        ApiProof.pending("zero.ui.Button#onClick(java.lang.Runnable)","ui-action","A replacement callback runs once after actual button activation",()->button.onClick(action),"java,ui-action");
    }
    public static void disable(Element element) {
        if(disabled){element.setEnabled(false);return;}disabled=true;
        ApiProof.pending("zero.ui.Element#setEnabled(boolean)","ui-disabled","A disabled retained control blocks actual attempted input without losing state",()->element.setEnabled(false),"disabled-controls");
    }
    public static void musicPlay(Music music) {
        if(playMusic){music.play();return;}playMusic=true;
        ApiProof.pending("zero.Music#play()","live-music-play","Play starts actual public music playback",music::play,"media,play");
    }
    public static void musicLoop(Music music) {
        if(loopMusic){music.loop();return;}loopMusic=true;
        ApiProof.pending("zero.Music#loop()","live-music-loop","Loop continues playing across an actual media end boundary",music::loop,"media,loop");
    }
    public static void musicPause(Music music) {
        if(pauseMusic){music.pause();return;}pauseMusic=true;
        ApiProof.pending("zero.Music#pause()","live-music-pause","Pause stops playback while retaining the actual playback position",music::pause,"media,pause");
    }
    public static void musicStop(Music music) {
        if(stopMusic){music.stop();return;}stopMusic=true;
        ApiProof.pending("zero.Music#stop()","live-music-stop","Stop halts actual playback and rewinds to the beginning",music::stop,"media,stop");
    }
    public static void soundPlay(Sound sound) {
        if(playSound){sound.play();return;}playSound=true;
        ApiProof.pending("zero.Sound#play()","live-sound-play","Play starts an actual effect voice and public playing status",sound::play,"media,sound-play");
    }
    public static void soundStop(Sound sound) {
        if(stopSound){sound.stop();return;}stopSound=true;
        ApiProof.pending("zero.Sound#stop()","live-sound-stop","Stop halts an active effect voice and clears public playing status",sound::stop,"media,sound-stop");
    }
}
