# Full Game

This is an optional complete source reference. For the continuing lessons,
read one method at a time and add the idea to your own existing Game code.
To run the whole reference, make a separate local copy of the starter in another
folder and copy only the files listed below into that new copy. Open that folder
in VS Code and click **Zero → Run App**. Keep your lesson project as it is; no
complete example project ZIP is required. The reference files are:


- `Camera.java` → `src/main/java/Camera.java`
- `Coin.java` → `src/main/java/Coin.java`
- `Enemy.java` → `src/main/java/Enemy.java`
- `Level.java` → `src/main/java/Level.java`
- `Main.java` → `src/main/java/Main.java`
- `Platform.java` → `src/main/java/Platform.java`
- `Player.java` → `src/main/java/Player.java`
- `../shared/ScoreDisplay.java` → `src/main/java/ScoreDisplay.java` (unchanged canonical component)
- `../media-demo/resources/media-demo/player.png` → `src/main/resources/media-demo/player.png`
- `../media-demo/resources/media-demo/chime.wav` → `src/main/resources/media-demo/chime.wav`

The two assets are reused from media-demo, not duplicated in this folder. Main
loads `/media-demo/player.png` and `/media-demo/chime.wav` once in setup; keep
those resource paths. The current starter includes the pinned JavaFX media dependency.

Run App and click the canvas for keyboard focus. A/D or Left/Right move; Space or Up jumps once per press while grounded. Collect all four coins before each green exit. The score carries across both levels (eight coins total). Enemy contact or falling loses; the second exit wins. Won/lost states freeze updates. The native Restart button resets both levels, score, player, patrols and camera. A jump still reported by the canvas is suppressed until released. Native controls clear canvas input when they take focus; physical key-repeat after refocusing needs testing.

Main explicitly updates and draws ordinary objects. Drawing saves the graphics
state, translates the world, and restores in a finally block. ScoreDisplay is an
ordinary JavaFX control outside the canvas. A collected coin triggers one brief
AudioClip at volume 0.25. Replace the PNG/short PCM WAV, click Run App again to customize.
The supplied assets are original MIT-licensed Zero assets.

Maintainer check: `python3 scripts/verify-examples.py --only full-game` from the repository
root copies the exact source/component/assets into a disposable starter and runs
`checks/FullGameCheck.java` as a finite native JavaFX launcher. These checks use synthetic
held keys and deterministic time; audible output, physical controls, classroom
usability and Windows/Linux need separate verification.
