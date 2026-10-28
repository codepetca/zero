# Make a pet game

This is a **local draft**, not a published tutorial or template. Make a bird pet that flaps, moves, and chimes, then give it its own `Pet` class. You need a Zero game project with the current image, sound and key APIs and Java 17. The matching pet template and asset download are not published by this draft; a teacher must provide them first.

## 1. Start your own project

On GitHub, use the matching pet/game template's **Use this template** button to create a repository in **your own** account. In Zero, choose **Project → Clone from GitHub…**, enter your repository's HTTPS address, and choose **Clone here**. Open that clone, not the template repository. After setup, editing and local Run work offline; GitHub actions and publishing need a connection. Submit your repository link separately in Pika if your teacher asks.

Copy the supplied `resources/pet/` files into `src/main/resources/pet/` in your project. Names must be exactly `bird-flap-sheet.png` and `chime.wav`. The leading `/` in `/pet/bird-flap-sheet.png` means the root of the project's resources, not your computer. See `ASSETS.md` for provenance. For your own replacements, use a PNG and a short PCM WAV and retain permission and attribution.

Start on **main**. The checkpoints here are complete reference files: type the changes yourself, or compare them when stuck. Java files go in `src/main/java/`, not `resources`. Save and **Run App** after each step; stop the app before changing and running again.

## 2. Show your pet

Write checkpoint `1/Main.java` in your project. `settings` sets canvas size, `setup` loads the picture once, and `draw` paints the background and picture each frame. `280, 150` is the top-left position; `80, 64` is its drawn size. The sheet has four poses; `imageRegion` selects the first pose. Run: you should see a bird. Try another background color or size. If the resource cannot load, check spelling, capitalization and the resource folder, then stop and run again.

## 3. Move, animate and make sound

Change `Main.java` to match checkpoint `2/Main.java`, adding one part at a time:

1. Add `x` and use it in `image` in place of `280`. In `update`, left and right change `x`. Multiplying by `seconds` makes speed depend on elapsed time, not the number of frames. The `Math.max`/`Math.min` line keeps the 80-pixel pet inside the canvas. Run, click the canvas, and hold the arrows.
2. Load the sheet once and define four `ImageRegion` frames as shown. Each region selects a 701 × 561 rectangle from the same picture; the lower poses begin at y = 531 to compensate for the artwork’s offset. Create `SpriteAnimation(8, frames)` for eight frames per second. Call `petAnimation.update(seconds)` once in `update`; `image` draws its current frame without advancing it. Run and watch the wings flap. Try a different frame rate.
3. Load the chime once in `setup`. In `update`, `keyPressed` fires on a new press, while `keyDown` stays true while held. Stop and play the chime on a Space press. Run, click the canvas, and press Space. Browser sound may need a user gesture and the device must not be muted.

## 4. Save the first working version and make a branch

With the working game on **main**, choose **Commit & push**. Review the files including the Java source and both assets, enter a useful message, and confirm. Check your repository on GitHub to see that main contains these files. Then choose **New branch** in the repository menu and name it `pet-refactor`. This creates a local branch for your next change.

## 5. Give the pet its own class

`Main` now knows the pet's position and animation as well as input and sound. Create `Pet.java` beside `Main.java` and write checkpoint `3/Pet.java`. A class describes a kind of object; `new Pet(new SpriteAnimation(8, frames))` creates one pet and gives it an animation. The constructor saves that animation. The position `x` and animation clock belong to that pet. Its `update` changes those fields, and `draw` uses them to paint the pet.

Update `Main.java` to match `3/Main.java`: replace the old animation and `x` fields with `Pet pet`; create it in `setup`; pass a direction, elapsed seconds and width to `pet.update`; and call `pet.draw(this)`. `this` is the running game that supplies drawing methods. Main still handles input and sound and calls the pet's update **once** per frame. Both arrows held together produce direction 0. Run again: the image, flapping, movement and Space sound should behave as before. Explain which data belongs to the pet and why Main no longer needs the animation update details. Try changing the speed in `Pet`.

## 6. Save and share deliberately

Run and check your game, then choose **Commit & push**, review the branch and changed files, enter a useful message, and confirm. This sends your branch to your repository. Commit & push remaining edits before **Merge to main**. Merge to main merges the current branch into main and pushes main; it does not create a pull request. If Zero brings in newer main code, Run App again, resolve reported conflicts carefully, and choose Merge to main again. Never discard work just to make a merge succeed.

To publish, stop the game, ensure the intended main version is committed and pushed, then use the Run dropdown's **Publish & open app** (or **Publish app** in an older released Zero). Review the account, repository, visibility and GitHub Pages prompts before confirming. Publishing makes the app available at its public URL; wait for success and open the link on another browser/device. If the command is unavailable or a build fails, keep your source and ask your teacher; do not assume a public page exists. Local edits after publishing are not automatically the published version.

## 7. Practise recovering your project

First verify on GitHub that the merged main contains all your Java files and both assets, and check the published app actually opens and works. Check the editor and Git status for uncommitted, untracked or unpushed work, including files ignored by Git. Commit and push what belongs in your repository, and copy any private or ignored files you need to a separate safe backup. Confirm that backup opens. GitHub cannot restore files you never uploaded.

Close the project. Move the original project folder to your computer’s Trash; **do not empty the Trash**. It remains recoverable there (unless your system automatically empties it), and you should retain another backup. Now use **Project → Clone from GitHub…** to clone your own repository into a different empty location. Open the new clone and Run App. Confirm picture, flapping, movement and chime. If anything is missing or the clone fails, restore the original folder from Trash or your backup; do not overwrite either copy. A future rebuild may need pinned tools and dependency hosts; keep a copy of your source and finished web output too.
