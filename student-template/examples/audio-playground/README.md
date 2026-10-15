# Audio playground

This optional example uses Zero's local, unreleased Sound and Music helpers.
Published core0.1.2 does not include them yet. Use a project prepared from current
repository source, then copy Main.java to src/main/java/Main.java and the two
files inside resources/audio-playground/ into src/main/resources/audio-playground/.
Run App. Python or a separate music tool is unnecessary.

Play sound triggers the short chime; Loop music repeats the longer track.
Pause preserves position, Resume continues, and Stop rewinds. Mute applies to
both resources. Closing the window automatically releases app-owned audio.
The app loads everything once in setup; buttons only control existing objects.

Sound uses a cached short clip. Repeated loadSound calls for one canonical
resource return the same live Sound, so volume/mute settings are shared.
Each loadMusic call owns an independent buffered player and playback position.
The two supplied files are original procedurally generated Sky Hop assets,
reused under the repository's MIT license (112BPM D-major theme and score chime).
Students can replace them with their own WAVs while keeping these Java handlers.
