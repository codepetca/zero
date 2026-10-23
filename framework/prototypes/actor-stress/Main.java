import zero.Color;
import zero.GameApp;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;

/** A repeatable drawing workload, not a collision or physics benchmark. */
public class Main extends GameApp {
    private StressActor[] actors = new StressActor[0];
    private final Label countLabel = new Label("Actors: 100");
    private final Label fpsLabel = new Label("FPS: warming up");
    private final Label frameLabel = new Label("Average frame: — | worst: —");
    private long lastFrameAt;
    private long sampleStartedAt;
    private long worstFrame;
    private int sampleFrames;

    public void settings() {
        title("Zero Actor stress test");
        size(800, 450);
        padding(16);
    }

    public void setup() {
        Button small = new Button("100 actors");
        small.onClick(() -> selectCount(100));
        Button medium = new Button("250 actors");
        medium.onClick(() -> selectCount(250));
        Button large = new Button("500 actors");
        large.onClick(() -> selectCount(500));

        controls(new Column(6,
                new Label("ACTOR STRESS TEST — choose a workload"),
                countLabel, fpsLabel, frameLabel,
                new Label("32 × 32 sprites, four frames at 8 animation fps; every actor moves and rotates."),
                new Label("FPS measures completed game frames. Higher FPS and lower frame time are smoother."),
                small, medium, large));
        selectCount(100);
    }

    public void selectCount(int count) {
        if (count != 100 && count != 250 && count != 500) {
            throw new IllegalArgumentException("Choose 100, 250 or 500 actors.");
        }
        actors = new StressActor[count];
        for (int i = 0; i < count; i++) {
            // loadAnimation shares the cached image but gives each actor its own clock.
            var animation = loadAnimation("/stress-sprites.png", 4, 1, 8);
            animation.update((i % 4) / 8.0);
            double vx = 30 + i % 40;
            double vy = 25 + i % 35;
            if (i % 2 == 0) vx = -vx;
            if (i % 3 == 0) vy = -vy;
            actors[i] = new StressActor(animation,
                    16 + (i * 73) % 768, 16 + (i * 47) % 418, vx, vy);
            actors[i].setRotation((i * 17) % 360);
        }
        countLabel.setText("Actors: " + count);
        fpsLabel.setText("FPS: warming up");
        frameLabel.setText("Average frame: — | worst: —");
        lastFrameAt = 0;
        sampleFrames = 0;
        worstFrame = 0;
    }

    public void update(double seconds) {
        for (StressActor actor : actors) actor.update(seconds);
    }

    public void draw() {
        background(Color.rgb(239, 246, 255));
        for (StressActor actor : actors) draw(actor);
        recordFrame();
    }

    private void recordFrame() {
        // Use real wall time: update(seconds) is deliberately clamped by GameApp.
        long now = System.currentTimeMillis();
        if (lastFrameAt == 0 || now < lastFrameAt) {
            lastFrameAt = now;
            sampleStartedAt = now;
            sampleFrames = 0;
            worstFrame = 0;
            return;
        }
        long frameMillis = now - lastFrameAt;
        lastFrameAt = now;
        if (frameMillis > worstFrame) worstFrame = frameMillis;
        sampleFrames++;
        long elapsed = now - sampleStartedAt;
        if (elapsed >= 1000) {
            int fps = (int) (sampleFrames * 1000.0 / elapsed + 0.5);
            double average = (int) (elapsed * 10.0 / sampleFrames) / 10.0;
            fpsLabel.setText("FPS: " + fps);
            frameLabel.setText("Average frame: " + average + " ms | worst: " + worstFrame + " ms");
            sampleStartedAt = now;
            sampleFrames = 0;
            worstFrame = 0;
        }
    }

    public static void main(String[] args) { launch(args); }
}
