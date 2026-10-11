# 12. Add your sprites and sounds

Start the larger game with two small assets.

## 1. Copy the demo

Stop and back up Main outside `src/`. Keep `zero/`. Copy:

| From | To |
| --- | --- |
| [Main.java](../examples/media-demo/Main.java) | `src/main/java/Main.java` |
| [player.png](../examples/media-demo/resources/media-demo/player.png) | `src/main/resources/media-demo/player.png` |
| [chime.wav](../examples/media-demo/resources/media-demo/chime.wav) | `src/main/resources/media-demo/chime.wav` |

Create the resource folders. The current source starter includes JavaFX media.
For an older downloaded kit, add this inside `pom.xml`'s `<dependencies>` only
if `javafx-media` is absent. Keep the existing JavaFX version:

```xml
<dependency>
  <groupId>org.openjfx</groupId>
  <artifactId>javafx-media</artifactId>
  <version>${javafx.version}</version>
</dependency>
```

The first run downloads that pinned module. No extra app or audio tool is needed.

## 2. Run and check

Run App. Expect a purple robot. Click **Play sound**: hear a short chime and see
`Plays: 1`. Click again: `Plays: 2`. A new click replaces the previous effect.

`setup()` loads Image and AudioClip once. `draw()` draws the same Image each
frame. The button triggers sound once; putting play in draw would repeat it.
Paths beginning `/` start at `src/main/resources/`, not your desktop.

## 3. Use your own assets

Replace `player.png` with your PNG and `chime.wav` with a short 16-bit PCM WAV.
Keep the names, or change their paths in Main too. Save → Stop → Run App.
The image is drawn at 96×96; change those dimensions to suit your sprite.
Change `sound.setVolume(0.25)` to adjust loudness from 0 to 1.

If the picture or sound fails, check filename case, resource location and format.
Missing/invalid resources report their path. If Plays changes but you hear
nothing, check your device and volume; the counter alone does not prove playback.
Use a brief effect. Longer music and its cleanup come later.

Previous: [Share a component](11-community.md). Return to the [lesson index](README.md).
