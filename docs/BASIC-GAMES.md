# Basic game completeness pass

Three local reference games use only `zero.*` and standard Java in all of their
student-authored Java files. No game calls `graphics()`, `canvas()`, `layout()` or
`fxNode()`. This is a small teaching framework, not automatic game physics.

| Game | Student-owned rules | Zero handles |
| --- | --- | --- |
| [Pong](../student-template/examples/zero-pong/README.md) | Paddle input, bounded computer opponent, ball velocity/bounces, score, match end | Actor coordinates/drawing, elapsed time, keys, UI and game navigation |
| [Collector](../student-template/examples/zero-collector/README.md) | Coins, health/protection, pursuit, shots, cooldown, victory/loss | Sprite loading, Actor facing/movement, primary pointer input, sound, drawing and controls |
| [Sky Steps](../student-template/examples/zero-platformer/README.md) | Gravity, jumping, one-way platform landings, coin/exit rules and restart | Game loop, Actor drawing, key edges, sound, title/HUD and pause |

These are maintainer completeness checks, not additional tutorial projects.
The student tutorial stays with the existing small Greeting, Study and Coin
examples; lessons 10–11 teach refactoring and contribution proposals. Main explicitly updates
each actor; substeps in Pong/platformer intentionally divide the same frame's time.
No actor registers itself or starts an extra animation timer.

## Small API gaps addressed

`zero.Key` now includes W/A/S/D, SPACE, ENTER, ESCAPE and R alongside the four
arrows. `GameApp.mouseDown()` and `mousePressed()` query the primary pointer
without requiring a toolkit enum. Existing JavaFX overloads remain available.
The queries retain canvas ownership, focus clearing and non-consuming frame-edge
rules. Zero reports keys; a student's game assigns their meaning.

Assets already have a Zero-only path: `loadImageRegion`, `loadAnimation`,
`ImageRegion`, `SpriteAnimation`, `Sound` and `Music`. No new image wrapper is
needed to use the ordinary sprite path. Existing `Actor.face` points toward a
coordinate; this pass did not add a second name for it.

Framework pause skips `update`, so a key tested there cannot resume it. Each
example keeps a visible Zero Resume button. Resuming or restarting explicitly
returns focus through `showGame()`. In browser testing, wait for the gameplay
view to mount before sending held keys; input sent to the old Play button is
correctly owned by that button rather than retroactively applied to the canvas.

## Opportunities from a student's perspective

- **Health and score components:** extract the collector's numeric health into a
  reusable bar with ordinary methods and an Element view. Keep health rules in
  the game so a visual replacement cannot change damage/scoring.
- **Collision convenience:** Actor centres versus rectangle top-left coordinates
  require repeated arithmetic. A reusable actor-bounds or overlap helper is a
  useful student contribution; physics response still belongs to the game.
- **Landing/jump behaviour:** the platformer's gravity, substeps and one-way tops
  make a good optional component. Coyote time and jump buffering could improve
  feel after students can explain the basic implementation.
- **Animation states:** idle/walk/hurt animation can implement the existing
  AnimationSource/AnimationPlayback contracts. Shared definitions must create
  independent mutable playback; no core patch or second timer is needed.
- **Camera and level organisation:** these games deliberately fit one screen.
  Larger examples should demonstrate a replaceable camera/container before we
  add more core classes. A full scene tree, physics engine or tile-map editor is
  not needed to complete these games.
- **HUD appearance and placement:** basic Zero rows/columns work; styling and
  richer layouts could be motivated by a real reusable widget. Avoid forcing
  beginners into toolkit bridges merely to improve an ordinary HUD.

Students can implement these as ordinary packages, Actor subclasses, or composed
Zero UI. Advanced contributors can wrap a supported JavaFX node in Element;
normal consumers use the resulting Zero-facing methods. Native JavaFX success
alone does not establish WebFX support. A contribution needs actual compilation
and behavior checks on both targets before claiming browser portability.
Live ZeroHub admission and core adoption remain separate reviewed steps.

## Repeatable local verification

Run `node --test scripts/basic-games.test.mjs` for the source-only boundary.
`npm run verify:games -- --cache=/absolute/compiler/cache` creates standalone
projects, compiles and runs finite native behavior checks, and exports each
through its own saved pinned WebFX builder. Outputs and editable source ZIPs are
under `.verification/basic-games/`. Browser interaction is a separate check;
a successful export alone is not proof of playability.

The test harnesses under `framework/basic-game-checks/` use toolkit APIs and
reflection solely to inspect native behavior. They are never shipped as game
source or included in browser exports. Legacy examples remain advanced/historical
examples; this pass does not relabel their toolkit imports as Zero-only.

These sources and documentation are local work. No public template, website,
ZeroHub catalog, installed kit or published release is updated by this pass.
