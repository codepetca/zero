# My sprite and sound

This is an optional complete source reference. In lesson 12, keep your existing
Coin game and add media to your own code. You may download only the
[image and sound ZIP](https://zero.codepet.ca/generated/learning-assets/game-assets.zip),
use your own files, or keep the drawing fallback.

To run this independent media demo, make a separate local copy of the starter.
Copy this folder's `Main.java` into that copy's `src/main/java/`, and its two
`resources/media-demo/` files into `src/main/resources/media-demo/`. The current
starter already includes JavaFX media. Open the separate folder in VS Code;
keep your ongoing lesson project as it is.

Run App. A purple robot appears; Play sound triggers a short chime and increments
Plays. Replace player.png and chime.wav with your own PNG and short PCM WAV, then
click Run App again. Load once in setup; draw the cached image each frame. AudioClip
is ordinary JavaFX, not a new Zero helper. Use short effects, not looping music.

The supplied 32×32 RGBA robot and 0.12-second mono 44.1kHz/16-bit PCM chime are
original assets created for Zero, covered by the repository MIT license. No
third-party assets or student generation tools are required. Keep attribution
for any assets you obtain elsewhere.
