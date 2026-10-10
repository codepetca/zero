# Collect the coins

Stop the app and save your current source outside `src/`. Copy **Main.java**,
**Player.java** and **Coin.java** from this folder into `src/main/java/`, replacing
Main and any old Player/Coin. Keep `src/main/java/zero/`. No Maven, shared component
or resource changes are needed. Choose one example Main at a time.

Run App, click the canvas and move with arrows. Touch each gold square to collect
it once. Collect all three to win; movement then stops. The ordinary JavaFX
Restart button resets position, coins, score and message. See
[Lesson 9](../../lessons/09-coin-game.md) for the progressive build and fourth coin.

Main owns points and the win rule; Player owns movement; each Coin remembers
collection. Main explicitly updates Player and draws Player/Coins. The whole
player stays inside the fixed 640 × 400 canvas. Edges count as contact.

`checks/CoinGameCheck.java` is a finite maintainer harness. It is not part of the
student copy; it controls frames deterministically and does not prove physical typing.
