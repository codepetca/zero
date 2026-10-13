# Platform Game

Download the [fresh platform-game project](/generated/lessons/zero-lesson-12-platforms.zip), unzip it into its own folder, open that folder in VS Code and click **Zero → Run App**. Keep this sample local. The project contains:

- `Camera.java` → `src/main/java/Camera.java`
- `Coin.java` → `src/main/java/Coin.java`
- `Main.java` → `src/main/java/Main.java`
- `Platform.java` → `src/main/java/Platform.java`
- `Player.java` → `src/main/java/Player.java`
- `../shared/ScoreDisplay.java` → `src/main/java/ScoreDisplay.java` (unchanged canonical component)
- `../media-demo/resources/media-demo/player.png` → `src/main/resources/media-demo/player.png`
- `../media-demo/resources/media-demo/chime.wav` → `src/main/resources/media-demo/chime.wav`

The two assets are reused from media-demo, not duplicated in this folder. Main
loads `/media-demo/player.png` and `/media-demo/chime.wav` once in setup; keep
those resource paths. The fresh project includes the pinned JavaFX media dependency.

Run App and click the canvas for keyboard focus. A/D or Left/Right move. Space or Up jumps once when pressed while grounded; release before jumping again. Gravity uses bounded 1/120-second substeps and separate horizontal/vertical solid response. Jump onto raised platforms and across gaps to collect four coins. Falling restores the world and score; rerun also starts over.

Main explicitly updates and draws ordinary objects. Drawing saves the graphics
state, translates the world, and restores in a finally block. ScoreDisplay is an
ordinary JavaFX control outside the canvas. A collected coin triggers one brief
AudioClip at volume 0.25. Replace the PNG/short PCM WAV, click Run App again to customize.
The supplied assets are original MIT-licensed Zero assets.

Maintainer check: `python3 scripts/verify-examples.py --only platform-game` from the repository
root copies the exact source/component/assets into a disposable starter and runs
`checks/PlatformGameCheck.java` as a finite native JavaFX launcher. These checks use synthetic
held keys and deterministic time; audible output, physical controls, classroom
usability and Windows/Linux need separate verification.
