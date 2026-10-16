# Sprite playground

This optional example uses the **local, unreleased** Zero game helpers. It is not
compatible with the unchanged published core 0.1.2. Prepare a project from the
current repository (`npm run prepare:starter` is a maintainer step), then copy:

- `Main.java` to `src/main/java/Main.java`.
- `src/main/resources/bird-flap-sheet.png` to the same resource path in your project.

Run App. Arrow keys move the bird. Space or a click pauses/resumes. R resets.
Switching to another window pauses the example; return and resume explicitly.
Touch the rectangle to change its color. The upside-down companion animates at
half speed. Both animation objects reference the same loaded image; their clocks
are independent. The 15-pixel hit radius is deliberately smaller than the artwork.

`Main.update(seconds)` explicitly moves the bird and advances both animations.
`draw()` draws their current frames. Press queries last one frame, while held arrow
queries remain true until released. Drawing helpers restore graphics state.

The supplied sheet is the original Image Gen bird artwork created for Sky Hop,
reused here under this repository's MIT license. It contains four wing poses in a
2×2 atlas. Its generated lower row is offset by 30 source pixels, so this example
constructs four aligned `ImageRegion` views once in `setup()`; no pixels are copied.
With a consistently aligned grid use the shorter form instead:

```java
// setup(): 4 equal cells across one row, 10 frames per second
walk = loadAnimation("/walk.png", 4, 1, 10);
// update(seconds):
walk.update(seconds);
// draw():
image(walk, 100, 150, 64, 64);
```

The file is about 1 MB compressed; its decoded RGBA pixels occupy about 6 MB.
Two animations share those pixels. Frame descriptors are constructed once, and
`update()`/drawing neither reload images nor crop new images per frame. Zero's
image cache belongs to the running app and is cleared when it stops; ordinary
Java references still determine when an image can be collected.
