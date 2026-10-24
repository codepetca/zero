# Sky Steps — Zero platformer

A complete small, fixed-screen game using only `zero` imports and ordinary Java.
Use a project prepared from current repository source; released kits may have
older APIs. Copy these four Java files into `src/main/java/` (replace the starter
Main), and copy `resources/media-demo/chime.wav` into
`src/main/resources/media-demo/chime.wav`. Run App, then choose **Play Sky Steps**.
The original procedural chime is reused from this repository's media demo under
the repository's MIT license. The character and scenery are drawn in Java.

## Play

- Move with A/D or Left/Right. Tap Space, W, or Up to jump.
- Collect all four coins, climbing from the left island to the highest platform.
- Reach the green flag on the right island after collecting every coin to win.
- Falling below the screen ends the run. Choose Restart or press R to retry.
- Choose Pause or press Escape to freeze play. Choose **Resume** to continue.
  Zero deliberately clears gameplay input while paused, so keyboard resume is
  not advertised. Restart also works while paused.
- Click the game canvas after interacting with a control if movement loses focus.

The HUD shows collected coins and elapsed playing time. The timer stops during
pause and after the win or loss. Restart resets coins, time, position and velocity.

## Read and change it

`Main extends GameApp` owns input, game state, UI, sound and one explicit
`player.update(seconds)` call per update. `Player extends Actor` owns velocity and
overrides `onUpdate` and `draw`; drawing never moves it. Actor's centre coordinates
are used consistently, including the half-width/half-height landing calculation.
`Platform` and `Coin` are ordinary objects that Main draws explicitly.

The player moves in pixels per second and accelerates in pixels per second
squared. Small time steps check whether descending feet crossed a platform top
while horizontally overlapping it. The same calculation keeps standing feet on
the top. These are intentionally **one-way platforms**: jumping upward through
them is allowed, and there is no side or ceiling collision. This example does not
claim an automatic physics or general collision system.

Try changing the level data, move speed, jump velocity, gravity, character
appearance or coin positions. Add a fifth island and coin, then replace the HUD's
four-coin wording with the new goal. Another extension is a student-owned level
class or a replaceable drawing component; neither requires a core framework edit.

## Remaining API ergonomics

The current Zero drawing helpers, Actor hooks, controls, sound and key queries
cover this game without JavaFX bridges. Menu text uses the small current Zero UI
surface; it has no built-in heading/typography theme. Keyboard input belongs to
the focused canvas, and paused games intentionally cannot poll a resume key.
A student may propose a reusable menu or an explicitly scoped input helper after
demonstrating a real need. Physics and collision remain readable game code here.
