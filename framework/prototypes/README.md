# Zero UI prototypes

The counter and structured COIN QUEST game exercise ordinary Java and Zero imports
in student code. Those two copy `shared/ScoreDisplay.java` unchanged. The
[beginner version](beginner-coin-game/README.md) keeps title/HUD/all other menus
directly in Main, with concrete Label/Button/Column types and a playing boolean.
It needs no student Element declarations, Hud, ScoreDisplay or screen classes.
The [animated Actor stress demo](actor-stress/README.md) adds live FPS/frame time
and six selectable workloads from 100 to 5000 sprites at 32/64/128/256-pixel sizes.
Its WebFX runner can measure all nine larger-size/high-count combinations.
The [live simulation](simulation/README.md) uses one GameApp loop and editable
speed, Apply, Pause/Resume and Reset controls. All five are local framework
experiments, not published tutorials or releases.

The counter composes its reusable score view with Add one and Reset buttons.
COIN QUEST begins on a title with Play and How to play; help returns with Back.
Gameplay has two levels of three coins, a blue player controlled by the pointer,
and a 30-active-second challenge per level starting on the first pointer movement.
The retained HUD combines ScoreDisplay, level/time labels, Pause and Restart game.
Pause offers Resume, Restart game and Title screen. Results show You win! or
Time's up!, the final score out of six, Play again and Title screen.

Main owns an explicit Phase enum, level/score/time rules and resets. TitleScreen,
HelpScreen, PauseScreen and ResultsScreen are ordinary student classes returning
Element. GameApp.show navigates away from gameplay and suspends update/draw/input;
showGame restores the same canvas/HUD. Explicit pause skips update while visible
gameplay still draws. Returning respects that pause until resume is called.
Navigation requested during a frame commits after its successful draw; idle UI
callbacks commit immediately. Navigation/pause/resume clear input, and resuming
updates starts with zero elapsed seconds. There is no zero.Screen lifetime class,
automatic navigation history or second game loop.

Run `node scripts/prepare-ui-prototypes.mjs` to assemble standalone projects in
`.verification/ui-prototypes/counter` and `.verification/ui-prototypes/coin-game`.
The beginner project is `.verification/ui-prototypes/beginner-coin-game`; it has
Main plus its own Player and Coin subclasses of Actor. Those objects draw their
own artwork; Main calls draw(coin) and draw(player) explicitly.
Each includes all 16 readable Zero helpers, the pinned student Maven wrapper/POM,
and ordinary Java app sources. Open any directory in Zero or run its included
`./mvnw javafx:run` (`mvnw.cmd javafx:run` on Windows). The assembled project does
not need the surrounding repository. Dependency artifacts must already be cached
for offline running. Preparation preserves edited or unowned output files.

Use `node scripts/prepare-ui-prototypes.mjs --only=simulation` to prepare just
the simulation without reading or rewriting other prototype outputs.
`node scripts/verify-ui-prototypes.mjs --only=simulation` runs only its finite
native check and writes `native-results-simulation.json`; the full-suite receipt
is retained. Comma-separated IDs are supported; empty, duplicate or unknown IDs
fail before assembly.

Run `node scripts/verify-ui-prototypes.mjs` for finite native acceptance using
offline Maven. Test drivers temporarily join the build and are removed afterward.
They open actual JavaFX windows, activate native button event handlers and send
synthetic canvas pointer events while the game's own animation frames run. The
flow checks should cover title/help, gameplay, pause/resume, results, replay/title
and continued play after reset in both game versions. Logs and a platform-specific
receipt remain in
the ignored output directory. A previous simple three-coin playthrough does not
establish acceptance of this fuller flow. Physical pointer input, browser output
and other operating systems require their own evidence. Actual WebFX compilation
and browser playthrough belong to the separate browser checks.

The fourth project is `.verification/ui-prototypes/actor-stress`. Native checks
verify its workload controls, moving actors and live metrics; the separate
`scripts/verify-actor-stress.mjs` builds and measures its WebFX browser output.
See its README for repeatable sampling and hardware limitations.
