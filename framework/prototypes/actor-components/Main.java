import zero.Actor;
import zero.AnimationSource;
import zero.Color;
import zero.GameApp;
import zero.ImageRegion;
import zero.SpriteAnimation;
import zero.contrib.r12345.actor_tools.TurnTowards;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;
import zero.ui.Row;

/** Replace presentation and behaviour without giving up the ordinary game loop. */
public class Main extends GameApp {
    private Actor[] actors;
    private DemoActor first;
    private DemoActor second;
    private ImageRegion[] frames;
    private SpriteAnimation looping;
    private OnceAnimation once;
    private final Label mode = new Label("");
    private final Button pauseButton = new Button("Pause");

    @Override public void settings() {
        title("Zero actor components");
        size(512, 240);
        padding(12);
    }

    @Override public void setup() {
        ImageRegion sheet = loadImageRegion("/actor-frames.png");
        frames = new ImageRegion[] {
            new ImageRegion(sheet.image(), 0, 0, 16, 16),
            new ImageRegion(sheet.image(), 16, 0, 16, 16),
            new ImageRegion(sheet.image(), 32, 0, 16, 16)
        };
        looping = new SpriteAnimation(4, frames);
        once = new OnceAnimation(4, frames);
        Button loop = new Button("Loop");
        Button oneShot = new Button("Once");
        Button image = new Button("Static image");
        Button procedural = new Button("Procedural");
        Button restart = new Button("Restart");
        loop.onClick(this::selectLoop);
        oneShot.onClick(this::selectOnce);
        image.onClick(this::selectImage);
        procedural.onClick(this::selectProcedural);
        pauseButton.onClick(this::togglePause);
        restart.onClick(this::restart);
        controls(new Column(8, new Row(loop, oneShot, image, procedural),
                new Row(pauseButton, restart), mode));
        restart();
    }

    private void restart() {
        first = new DemoActor(frames[0], 160, 120);
        second = new DemoActor(frames[0], 352, 120);
        actors = new Actor[] {first, second};
        for (Actor actor : actors) actor.setSize(64, 64);
        selectLoop();
        resume();
        pauseButton.setText("Pause");
    }

    private void selectAnimation(AnimationSource source, String description) {
        first.procedural(false);
        second.procedural(false);
        for (Actor actor : actors) actor.setImage(source);
        // Same source, different clocks. Drawing never advances either clock.
        first.update(0.25);
        mode.setText(description);
    }

    private void selectLoop() { selectAnimation(looping, "Loop: independent clocks"); }
    private void selectOnce() { selectAnimation(once, "Once: stops on blue"); }

    private void selectImage() {
        for (Actor actor : actors) actor.setImage(frames[0]);
        first.procedural(false);
        second.procedural(false);
        mode.setText("Static image: animation detached");
    }

    private void selectProcedural() {
        // A static image detaches playback before switching to custom drawing.
        for (Actor actor : actors) actor.setImage(frames[0]);
        first.procedural(true);
        second.procedural(true);
        mode.setText("Procedural: local circle and heading mark");
    }

    private void togglePause() {
        if (isPaused()) { resume(); pauseButton.setText("Pause"); }
        else { pause(); pauseButton.setText("Resume"); }
    }

    @Override public void update(double seconds) {
        for (Actor actor : actors) {
            TurnTowards.apply(actor, 256, 60, 45, seconds);
            actor.update(seconds);
        }
    }

    @Override public void draw() {
        background(Color.WHITE);
        fill(Color.BLACK);
        textCentered("Turn toward this point", 256, 35);
        circle(256, 60, 6);
        for (Actor actor : actors) draw(actor);
        fill(Color.BLACK);
        textCentered("First: +0.25 s", 160, 205);
        textCentered("Second: starts at 0 s", 352, 205);
    }

    // Maintainer checks can use the public Actor contract without reflection.
    Actor actor(int index) { return actors[index]; }
    ImageRegion frame(int index) { return frames[index]; }

    public static void main(String[] args) { launch(args); }
}
