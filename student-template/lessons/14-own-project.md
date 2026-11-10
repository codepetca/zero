# 9. Add a welcome screen

![An illustrated game welcome screen](visuals/14.svg)

Continue the same Pet project and `pet-refactor` branch from [lesson 8](17-pet-class.md); keep both `java/Main.java` and `java/Pet.java`. These changes start from the lesson 8 checkpoint. If you changed it, adapt the matching lines to your version.

## 1. Import Button

In `Main.java`, add the import after the existing imports. Copy each block over its matching lines; highlighted additions are part of the copied code.

```java-after-2
import zero.SpriteAnimation;
import zero.ui.Button;
```

## 2. Remember the current scene

Add two fields beside the existing fields. `playing` starts false, so the welcome screen appears first.

```java-after-3-4
    private Pet pet;
    private Sound chime;
    private boolean playing = false;
    private Button navigation;
```

## 3. Create the navigation button

At the end of `setup()`, create a button in the controls area and give it an action:

```java-after-2-3-4
        chime.setVolume(0.25);
        navigation = new Button("Start");
        navigation.onClick(this::switchScreen);
        controls(navigation);
    }
```

## 4. Switch between scenes

Add this method after `setup()`. Each click changes the scene and the button label.

```java-after-4-5-6-7
        controls(navigation);
    }

    private void switchScreen() {
        playing = !playing;
        navigation.setText(playing ? "Back" : "Start");
    }
```

## 5. Pause the game on the welcome screen

At the start of `update`, return while the welcome screen is showing. The existing input, pet animation and sound code stays below it. The same `Pet` object keeps its position when you return.

```java-after-2
    @Override public void update(double seconds) {
        if (!playing) return;
```

## 6. Draw each scene

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

## 7. Test both scenes

Save and choose **Run**. Click **Start**, click the canvas and use the arrows and Space. Click **Back**, then **Start** again: the pet should resume from its saved position. The button stays in the controls area while the canvas changes. Change the welcome title, colours or shapes to make it yours, then check both scenes again.

## 8. Save and sync your branch

Check that `pet-refactor` is selected. Review your code and README for private
information, then save your files. Enter `Add the welcome screen` and choose:

**Commit**

Then choose:

**Sync**

The first Sync creates `pet-refactor` on GitHub and sends both saved
checkpoints. Open your repository on GitHub, select `pet-refactor` in its
branch list, and check for your welcome-screen commit.

## 9. Merge your work

Stop the game and check that all the edits you want are committed. Beside
`pet-refactor` in Zero's **Project** panel, choose:

**Merge**

When Zero asks **Merge pet-refactor into main?**, confirm with **Merge**. Zero
merges the branch and syncs **main** to GitHub. Check that **main** is selected
in Zero, then run the game and try **Start** and **Back**. The feature branch
stays in your branch list.

If Zero reports newer work on GitHub **main**, choose **Update from main**
from the branch menu. If Source Control reports a conflict, get help resolving
it and keep your work. Run and test the combined game before trying **Merge**
again. Submit your repository link separately in Pika if assigned.

## 10. Publish your game

Stop the game and check that the tested version is on GitHub **main**. Open
the dropdown next to **Run**, then choose:

**Publish & open app**

An older released Zero may call this **Publish app**. Review the account, repository, visibility and GitHub Pages prompts before confirming. Publishing makes the app available at its public URL. Wait for success and open the link on another browser or device. Test Start, Back, movement and sound. If the command is unavailable or a build fails, keep your source and check the publishing guidance; do not assume a public page exists. Local edits after publishing are not automatically the published version.

## 11. Back up your project

Verify that GitHub **main** contains both Java files and both assets, and check
that the published app works if you published it. Check **Files** for
uncommitted or new files and **Sync** for commits still on this computer.
Commit and sync anything that belongs in your repository, including work on
other branches you want to keep. Also check the project folder for ignored
files and copy any private or ignored files you need to a separate safe
backup. Confirm that the backup opens. A new clone can recover only the files
you sent to GitHub.

## 12. Practise recovering your project

Close the project. Move the original project folder to your computer’s Trash; **do not empty the Trash**. It remains recoverable there (unless your system automatically empties it), and you should retain another backup. On the Zero Start Page, choose:

**Project → Clone**

Clone your own repository into a different empty location. Open the new clone and choose **Run**. Confirm the welcome screen, Start and Back, picture, flapping, movement and chime. If anything is missing or the clone fails, restore the original folder from Trash or your backup; do not overwrite either copy. A future rebuild may need pinned tools and dependency hosts; keep a copy of your source and finished web output too.
