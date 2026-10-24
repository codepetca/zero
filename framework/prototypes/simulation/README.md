# Live simulation

One `Main extends GameApp` moves a blue circle horizontally and bounces it at the
canvas edges. Its radius is 12 pixels. The initial position is x=60 at half the
canvas height, moving right at 120 pixels per second.

Type a whole-number speed from 0 through 400, then choose **Apply**. Spaces around
the number are accepted. Invalid text, numeric overflow and out-of-range numbers
show an error and preserve the last accepted speed. Zero stops the motion while
the game loop remains running. **Pause** freezes updates; **Resume** continues.
Apply still works while paused. **Reset** restores position, direction, speed120,
input text, labels and running state.

All student imports come from Zero. Main owns ordinary fields and updates them
explicitly in `update(seconds)` or button callbacks. `draw()` renders that state.
There is one GameApp loop, with no second timer or automatic simulation objects.

From the repository root:

```sh
node scripts/prepare-ui-prototypes.mjs --only=simulation
node scripts/verify-ui-prototypes.mjs --only=simulation
```

The first command assembles `.verification/ui-prototypes/simulation` with readable
Zero sources and pinned Maven setup. Open that project in Zero, or run its included
`./mvnw javafx:run` (`mvnw.cmd javafx:run` on Windows). It needs no assets. The
finite native check activates live controls, observes real frames and checks
model edge cases. Browser input and rendering require a separate actual export
and browser check. This is a local prototype, not a published tutorial or release.
