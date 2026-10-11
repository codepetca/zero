# Scrolling Game

Stop App and back up the previous Java example outside `src/`. Replace its top-level
Java files with this stage's complete set; do not combine different stages. Keep
`src/main/java/zero/`, the pinned build files and the Maven wrapper.

- `Camera.java` → `src/main/java/Camera.java`
- `Coin.java` → `src/main/java/Coin.java`
- `Main.java` → `src/main/java/Main.java`
- `Player.java` → `src/main/java/Player.java`
- `../shared/ScoreDisplay.java` → `src/main/java/ScoreDisplay.java` (unchanged canonical component)
- `../media-demo/resources/media-demo/player.png` → `src/main/resources/media-demo/player.png`
- `../media-demo/resources/media-demo/chime.wav` → `src/main/resources/media-demo/chime.wav`

The two assets are reused from media-demo, not duplicated in this folder. Main
loads `/media-demo/player.png` and `/media-demo/chime.wav` once in setup; keep
those resource paths. Use the pinned JavaFX media dependency already in this kit
(see [Lesson 12](../../lessons/12-media.md) for older kits).

Run App and click the canvas for keyboard focus. A/D or Left/Right move through a 1600px world. The camera follows world coordinates and clamps at each end; the native ScoreDisplay stays fixed. Collect all three gold squares. You can keep exploring after collecting them; rerun to start over.

Main explicitly updates and draws ordinary objects. Drawing saves the graphics
state, translates the world, and restores in a finally block. ScoreDisplay is an
ordinary JavaFX control outside the canvas. A collected coin triggers one brief
AudioClip at volume 0.25. Replace the PNG/short PCM WAV, stop and rerun to customize.
The supplied assets are original MIT-licensed Zero assets.

Maintainer check: `python3 scripts/verify-examples.py --only scrolling-game` from the repository
root copies the exact source/component/assets into a disposable starter and runs
`checks/ScrollingGameCheck.java` as a finite native JavaFX launcher. These checks use synthetic
held keys and deterministic time; audible output, physical controls, classroom
usability and Windows/Linux need separate verification.
