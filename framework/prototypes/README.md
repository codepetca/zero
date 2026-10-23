# Zero UI prototypes

The counter and pointer coin game exercise the first Zero UI components without
JavaFX imports in student code. Both copy `shared/ScoreDisplay.java` unchanged.
They are local framework experiments, not published tutorials or releases.

Run `node scripts/prepare-ui-prototypes.mjs` to assemble standalone projects in
`.verification/ui-prototypes/counter` and `.verification/ui-prototypes/coin-game`.
Each includes all 13 readable Zero helpers, the pinned student Maven wrapper/POM,
and ordinary Java app sources. Open either directory in Zero or run its included
`./mvnw javafx:run` (`mvnw.cmd javafx:run` on Windows). The assembled project does
not need the surrounding repository. Dependency artifacts must already be cached
for offline running. Preparation preserves edited or unowned output files.

Run `node scripts/verify-ui-prototypes.mjs` for finite native acceptance using
offline Maven. Test drivers temporarily join the build and are removed afterward.
They open actual JavaFX windows, activate native button event handlers and send
synthetic canvas mouse-move events while the game's own animation frames run.
The counter reaches 2, resets to 0 and reaches 1. The game collects all three
coins, wins, restarts at 0 and wins a second time with the live HUD present.
Logs and a platform-specific receipt remain inside the ignored output directory.
This does not prove physical pointer input, browser output or another operating
system. Browser compilation/playthrough belongs to the separate WebFX checks.
