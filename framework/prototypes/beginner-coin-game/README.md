# Beginner Coin Quest

This is the same two-level game with all UI code in [Main.java](Main.java).
The title, instructions, HUD, pause menu and results are ordinary methods using
concrete Label, Button and Column objects. Score, level and time labels are fields;
updateHud changes their text. Buttons call methods using simple click callbacks.
A playing boolean replaces the structured example's Phase enum.

Student code declares no Element variables or return types, view methods, custom
UI subclasses, Runnable parameters or method references. Main extends GameApp as
the starter template; Zero still uses inheritance and polymorphism internally.
Students can first learn the controls as building blocks and click callbacks as
"when clicked, call this method." Arrays, loops, methods and ordinary objects
remain part of the game. This is a complete example, not a claim that every line
belongs in the first lesson.

The ordinary [Player](../coin-game/Player.java) and [Coin](../coin-game/Coin.java)
classes are copied unchanged from the structured game. The assembled project has
three student Java files: Main, Player and Coin. Its Zero library source stays in
the separate zero package. No framework API changes are needed for this version.

From the repository root, run `node scripts/prepare-ui-prototypes.mjs`, then open
`.verification/ui-prototypes/beginner-coin-game` in Zero or run its included
`./mvnw javafx:run` (`mvnw.cmd javafx:run` on Windows). Native verification is
`node scripts/verify-ui-prototypes.mjs`; both game versions use the same UI
playthrough driver. Dependencies must be cached for the offline verification.

Later, compare the [structured Main](../coin-game/Main.java): extract the HUD into
Hud and the title into TitleScreen when organizing and reusing code becomes the
lesson. Introduce Element as their common UI return type at that point.
