# 8. Give your pet a class

![Illustration of a bird pet game](visuals/13.svg)

Continue the same Pet project from [lesson 7](16-pet-motion.md). Your bird should move, flap and chime.

## 1. Start a branch for this change

Before you refactor, make sure your working game is committed and pushed on **main** as described at the end of lesson 7. In the Zero sidebar, click your project name to open its actions, then choose:

**New branch…**

Name it `pet-refactor` and confirm. Zero creates and switches to a local branch, so your refactor has its own place to grow. Check that `pet-refactor` appears as the current branch.

## 2. Give the pet its own class

`Main` currently handles the pet's position and animation as well as input and sound. A class lets the pet own its position and animation instead.

Create `Pet.java` beside `Main.java` in the `java` folder. Put this complete class in the new file and save it:

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

The constructor saves the animation, and `x` holds the pet's position. The `update` method moves and animates the pet; `draw` paints it using the game passed to it.

## 3. Update Main to use your pet

Open `java/Main.java`, select its entire contents and replace them with this complete file. Save it alongside `Pet.java`:

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

Main creates one pet with `new Pet(new SpriteAnimation(8, frames))`. Each frame, it passes the direction, elapsed time and canvas width to `pet.update` **once**, then calls `pet.draw(this)`. Here `this` is the running game that supplies the drawing methods. Main still handles the keys and sound; holding both arrows gives direction 0.

## 4. Test the refactor

Run the app and click the canvas. Check that the bird still appears and flaps, the arrow keys move it, and Space plays the chime. Hold both arrows together and check that the bird stays in place. The game should behave as it did before the refactor.

If something does not work, compare your files with [Pet.java](../../teaching/checkpoints/13/3/Pet.java) and [Main.java](../../teaching/checkpoints/13/3/Main.java). Explain which data belongs to the pet and why Main no longer needs the animation update details. Try changing the speed in `Pet`, then restore it before the next lesson so its examples match your code.

Keep this project open for [the welcome screen](14-own-project.md).
