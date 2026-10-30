# 6. Show your pet

![Illustration of a bird pet game](visuals/13.svg)

## 1. Start your own project

In Zero choose **Start tutorial → Animated pet**, sign in, name your project and choose a clone location. Zero creates your own repository and opens its clone. After setup, editing and local Run work offline; GitHub actions and publishing need a connection. Submit your repository link separately in Pika if assigned.

Download the [Pet assets ZIP](https://zero.codepet.ca/generated/learning-assets/pet-assets.zip) and unzip it. In Zero's file tree, right-click **resources**, choose **New folder…** and name it `pet`. Right-click the new **pet** folder, choose **Import assets…**, and select both files from the unzipped `pet` folder. The imported files belong in `resources/pet/` and must be named `bird-flap-sheet.png` and `chime.wav`. The leading `/` in `/pet/bird-flap-sheet.png` means the root of the project's resources, not your computer. The bird and chime are Zero assets supplied under the project license. For your own replacements, use a PNG and a short PCM WAV and retain permission and attribution.

Start on **main**. The checkpoints here are complete reference files: type the changes yourself, or compare them when stuck. Java files go in `java/`, not `resources`. Save and **Run App** after each step; stop the app before changing and running again.

## 2. Show your pet

Open `java/Main.java`, select its entire contents, and replace them with the complete file below. `settings` sets canvas size, `setup` loads the picture once, and `draw` paints the background and picture each frame. `280, 150` is the top-left position; `80, 64` is its drawn size. The sheet has four poses; `imageRegion` selects the first pose. Run: you should see a bird. Try another background color or size. If the resource cannot load, check spelling, capitalization and the resource folder, then stop and run again.

```java
import zero.Color;
import zero.GameApp;
import zero.ImageRegion;

public class Main extends GameApp {
    private ImageRegion petImage;

    @Override public void settings() { size(640, 400); }
    @Override public void setup() {
        var sheet = loadImage("/pet/bird-flap-sheet.png");
        petImage = imageRegion(sheet, 0, 0, 701, 561);
    }

    @Override public void draw() {
        background(Color.rgb(240, 248, 255));
        image(petImage, 280, 150, 80, 64);
    }

    public static void main(String[] args) { launch(args); }
}
```

Next: [Move and animate your pet](16-pet-motion.md).
