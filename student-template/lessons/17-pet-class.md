# 8. Give your pet a class

![Illustration of a bird pet game](visuals/13.svg)

Continue the same Pet project on the `pet-refactor` branch from [lesson 7](16-pet-motion.md).

## 1. Give the pet its own class

`Main` now knows the pet's position and animation as well as input and sound. Create `Pet.java` beside `Main.java` and put the entire first class below in that new file. Then select the entire contents of `Main.java` and replace them with the second complete class below. A class describes a kind of object; `new Pet(new SpriteAnimation(8, frames))` creates one pet and gives it an animation. The constructor saves that animation. The position `x` and animation clock belong to that pet. Its `update` changes those fields, and `draw` uses them to paint the pet.

Update `Main.java` to match `3/Main.java`: replace the old animation and `x` fields with `Pet pet`; create it in `setup`; pass a direction, elapsed seconds and width to `pet.update`; and call `pet.draw(this)`. `this` is the running game that supplies drawing methods. Main still handles input and sound and calls the pet's update **once** per frame. Both arrows held together produce direction 0. Run again: the image, flapping, movement and Space sound should behave as before. Explain which data belongs to the pet and why Main no longer needs the animation update details. Try changing the speed in `Pet`.

```java
import zero.GameApp;
import zero.SpriteAnimation;

// One pet owns its position and animation clock.
public class Pet {
    private final SpriteAnimation animation;
    private double x = 280;

    public Pet(SpriteAnimation animation) { this.animation = animation; }

    public void update(int direction, double seconds, double canvasWidth) {
        x += direction * 160 * seconds;
        x = Math.max(0, Math.min(x, canvasWidth - 80));
        animation.update(seconds);
    }

    public void draw(GameApp game) {
        game.image(animation, x, 150, 80, 64);
    }
}
```

Replace the entire contents of `Main.java` with this second file:

```java
import zero.Color;
import zero.GameApp;
import zero.ImageRegion;
import zero.Key;
import zero.Sound;
import zero.SpriteAnimation;

public class Main extends GameApp {
    private Pet pet;
    private Sound chime;

    @Override public void settings() { size(640, 400); }
    @Override public void setup() {
        var sheet = loadImage("/pet/bird-flap-sheet.png");
        ImageRegion[] frames = {
            imageRegion(sheet, 0, 0, 701, 561),
            imageRegion(sheet, 701, 0, 701, 561),
            imageRegion(sheet, 0, 531, 701, 561),
            imageRegion(sheet, 701, 531, 701, 561)
        };
        pet = new Pet(new SpriteAnimation(8, frames));
        chime = loadSound("/pet/chime.wav");
        chime.setVolume(0.25);
    }

    @Override public void update(double seconds) {
        int direction = 0;
        if (keyDown(Key.LEFT)) direction--;
        if (keyDown(Key.RIGHT)) direction++;
        pet.update(direction, seconds, width());
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
        pet.draw(this);
    }

    public static void main(String[] args) { launch(args); }
}
```

Compare with [Pet.java](../../teaching/checkpoints/13/3/Pet.java) and [Main.java](../../teaching/checkpoints/13/3/Main.java).

Keep this project open for [the welcome screen](14-own-project.md).
