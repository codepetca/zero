# 9. Add a welcome screen

![An illustrated game welcome screen](visuals/14.svg)

Continue the same Pet project and `pet-refactor` branch from [lesson 8](17-pet-class.md); keep both `java/Main.java` and `java/Pet.java`. These changes start from the lesson 8 checkpoint. If you changed it, adapt the matching lines to your version.

## 1. Add a button and remember the scene

In `Main.java`, add the import after the existing imports. Copy each block over its matching lines; highlighted additions are part of the copied code.

```java-after-2
import zero.SpriteAnimation;
import zero.ui.Button;
```

Add two fields beside the existing fields. `playing` starts false, so the welcome screen appears first.

```java-after-3-4
    private Pet pet;
    private Sound chime;
    private boolean playing = false;
    private Button navigation;
```

At the end of `setup()`, create a button in the controls area and give it an action:

```java-after-2-3-4
        chime.setVolume(0.25);
        navigation = new Button("Start");
        navigation.onClick(this::switchScreen);
        controls(navigation);
    }
```

Add this method after `setup()`. Each click changes the scene and the button label.

```java-after-4-5-6-7
        controls(navigation);
    }

    private void switchScreen() {
        playing = !playing;
        navigation.setText(playing ? "Back" : "Start");
    }
```

## 2. Pause the game on the welcome screen

At the start of `update`, return while the welcome screen is showing. The existing input, pet animation and sound code stays below it. The same `Pet` object keeps its position when you return.

```java-after-2
    @Override public void update(double seconds) {
        if (!playing) return;
```

## 3. Draw each scene

Replace the matching start of `draw` with this block. Keep the existing background, instructions and `pet.draw(this)` below it; those lines draw the game scene when `playing` is true.

```java-after-2-3-4-5-6-7-8-9-10-11-12
    @Override public void draw() {
        if (!playing) {
            background(Color.rgb(19, 24, 55));
            fill(Color.rgb(255, 224, 145));
            circle(520, 70, 70);
            fill(Color.WHITE);
            textSize(38);
            text("MY PET GAME", 55, 205);
            textSize(18);
            text("Press Start to meet your pet", 57, 242);
            return;
        }
        background(Color.rgb(240, 248, 255));
```

Save and **Run App**. Click **Start**, click the canvas and use the arrows and Space. Click **Back**, then **Start** again: the pet should resume from its saved position. The button stays in the controls area while the canvas changes. Change the welcome title, colours or shapes to make it yours, then check both scenes again.

## 4. Save and share deliberately

Review your code and README for private information before sharing publicly. Run and check your game, then choose **Commit & push**, review the branch and changed files, enter a useful message, and confirm. This sends your branch to your repository. Commit & push remaining edits before **Merge to main**. Merge to main merges the current branch into main and pushes main; it does not create a pull request. If Zero brings in newer main code, Run App again, resolve reported conflicts carefully, and choose Merge to main again. Never discard work just to make a merge succeed. Submit your repository link separately in Pika if assigned.

To publish, stop the game, ensure the intended main version is committed and pushed, then use the Run dropdown's **Publish & open app** (or **Publish app** in an older released Zero). Review the account, repository, visibility and GitHub Pages prompts before confirming. Publishing makes the app available at its public URL; wait for success and open the link on another browser/device. Test Start, Back, movement and sound. If the command is unavailable or a build fails, keep your source and check the publishing guidance; do not assume a public page exists. Local edits after publishing are not automatically the published version.

## 5. Practise recovering your project

First verify on GitHub that the merged main contains both Java files and both assets, and check the published app actually opens and works. Review the changes and push status in Zero for uncommitted, untracked or unpushed work. Also look through the project folder for files Git ignores: they may not appear in the change list. Commit and push what belongs in your repository, and copy any private or ignored files you need to a separate safe backup. Confirm that backup opens. GitHub cannot restore files you never uploaded.

Close the project. Move the original project folder to your computer’s Trash; **do not empty the Trash**. It remains recoverable there (unless your system automatically empties it), and you should retain another backup. Now use **Project → Clone** to clone your own repository into a different empty location. Open the new clone and Run App. Confirm the welcome screen, Start and Back, picture, flapping, movement and chime. If anything is missing or the clone fails, restore the original folder from Trash or your backup; do not overwrite either copy. A future rebuild may need pinned tools and dependency hosts; keep a copy of your source and finished web output too.
