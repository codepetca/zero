# 7. Animate your pet

![Illustration of a bird pet game](visuals/13.svg)

Continue the same Pet project from [lesson 6](13-pet.md). Open `java/Main.java`. Save and Run App after the change.

## 1. Move, animate and make sound

Replace `Main.java` with the version below, then read and try each change:

1. Find `x` in the field and `image` call. In `update`, left and right change `x`. Multiplying by `seconds` makes speed depend on elapsed time, not the number of frames. The `Math.max`/`Math.min` line keeps the 80-pixel pet inside the canvas. After running, click the canvas and hold the arrows.
2. In `setup`, the sheet loads once and four `ImageRegion` frames describe its poses. Each region selects a 701 × 561 rectangle from the same picture; the lower poses begin at y = 531 to compensate for the artwork’s offset. `SpriteAnimation(8, frames)` sets eight frames per second. `petAnimation.update(seconds)` advances it once in `update`; `image` draws its current frame without advancing it. Watch the wings flap; then try a different frame rate.
3. Find where the chime loads once in `setup`. In `update`, `keyPressed` fires on a new press, while `keyDown` stays true while held. Stop and play the chime on a Space press. Click the canvas and press Space. Browser sound may need a user gesture and the device must not be muted.

```java
import zero.Color;
import zero.GameApp;
import zero.ImageRegion;
import zero.Key;
import zero.Sound;
import zero.SpriteAnimation;

public class Main extends GameApp {
    private SpriteAnimation petAnimation;
    private Sound chime;
    private double x = 280;

    @Override public void settings() { size(640, 400); }
    @Override public void setup() {
        var sheet = loadImageRegion("/pet/bird-flap-sheet.png");
        ImageRegion[] frames = {
            imageRegion(sheet.image(), 0, 0, 701, 561),
            imageRegion(sheet.image(), 701, 0, 701, 561),
            imageRegion(sheet.image(), 0, 531, 701, 561),
            imageRegion(sheet.image(), 701, 531, 701, 561)
        };
        petAnimation = new SpriteAnimation(8, frames);
        chime = loadSound("/pet/chime.wav");
        chime.setVolume(0.25);
    }

    @Override public void update(double seconds) {
        if (keyDown(Key.LEFT)) x -= 160 * seconds;
        if (keyDown(Key.RIGHT)) x += 160 * seconds;
        x = Math.max(0, Math.min(x, width() - 80));
        petAnimation.update(seconds);
        if (keyPressed(Key.SPACE)) {
            chime.stop();
            chime.play();
        }
    }

    @Override public void draw() {
        background(Color.rgb(240, 248, 255));
        fill(Color.rgb(47, 79, 79));
        textSize(20);
        text("Click the canvas; arrows move, Space chimes.", 20, 30);
        image(petAnimation, x, 150, 80, 64);
    }

    public static void main(String[] args) { launch(args); }
}
```

Compare with the [movement checkpoint](../../teaching/checkpoints/13/2/Main.java).

## 2. Save the first working version and make a branch

With the working game on **main**, choose **Commit & push**. Review the files including the Java source and both assets, enter a useful message, and confirm. Check your repository on GitHub to see that main contains these files. Then choose **New branch** in the repository menu and name it `pet-refactor`. This creates a local branch for your next change.

Next: [Give the pet its own class](17-pet-class.md).
