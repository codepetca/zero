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

The [Player](Player.java) and [Coin](Coin.java) classes extend Actor and draw their
own artwork. Main calls draw(player) and draw(coin) explicitly. Zero supplies the
canvas for each draw call, places (0, 0) at the actor's centre, applies its rotation
and restores drawing settings afterward. Students can call fill, circle, stroke
and other inherited drawing helpers inside their actor's draw method, without a
GameApp parameter. Those helpers require an active draw call from Main.

Actor already supplies position and movement methods. Player's three-argument
moveToward chooses a speed of 260 pixels per second using the inherited movement;
the player now faces its direction of travel. Coin uses x()/y() for collision
positions and skips its own drawing when collected. setSize declares dimensions;
it does not scale custom shape coordinates. Moving, updating and drawing remain
explicit. Main still holds all UI code, with no custom UI classes.

This introduces inheritance and overriding through a concrete game object;
students do not need Element or mixed-type collections to follow it. The assembled
project has three student Java files: Main, Player and Coin. Its Zero library
source stays in the separate zero package. The structured example remains an
alternative using ordinary Player/Coin objects and drawing in Main.

From the repository root, run `node scripts/prepare-ui-prototypes.mjs`, then open
`.verification/ui-prototypes/beginner-coin-game` in Zero or run its included
`./mvnw javafx:run` (`mvnw.cmd javafx:run` on Windows). Native verification is
`node scripts/verify-ui-prototypes.mjs`; both game versions use the same UI
playthrough driver. Dependencies must be cached for the offline verification.

Later, compare the [structured Main](../coin-game/Main.java): extract the HUD into
Hud and the title into TitleScreen when organizing and reusing code becomes the
lesson. Introduce Element as their common UI return type at that point.
