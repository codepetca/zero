# My sprite and sound

Stop and back up your Main outside `src/`. Copy this Main to
`src/main/java/Main.java`. Copy `resources/media-demo/` to
`src/main/resources/media-demo/`. Keep `zero/` and the other build files.
[Lesson 12](../../lessons/12-media.md) includes the dependency needed by older kits.

Run App. A purple robot appears; Play sound triggers a short chime and increments
Plays. Replace player.png and chime.wav with your own PNG and short PCM WAV, save,
stop and rerun. Load once in setup; draw the cached image each frame. AudioClip
is ordinary JavaFX, not a new Zero helper. Use short effects, not looping music.

The supplied 32×32 RGBA robot and 0.12-second mono 44.1kHz/16-bit PCM chime are
original assets created for Zero, covered by the repository MIT license. No
third-party assets or student generation tools are required. Keep attribution
for any assets you obtain elsewhere.
