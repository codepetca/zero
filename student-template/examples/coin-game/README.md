# Collect the coins

To run the completed example, create a new local project from a fresh Zero starter and copy **Main.java**, **Player.java** and **Coin.java** into its `src/main/java/`. Keep this sample off GitHub.

Run App, click the canvas and move with arrows. Touch each gold square to collect
it once. Collect all three to win; movement then stops. The ordinary JavaFX
Restart button resets position, coins, score and message. See
[Lesson 9](https://zero.codepet.ca/tutorials/9) for the progressive build and fourth coin.

Main owns points and the win rule; Player owns movement; each Coin remembers
collection. Main explicitly updates Player and draws Player/Coins. The whole
player stays inside the fixed 640 × 400 canvas. Edges count as contact.

`checks/CoinGameCheck.java` is a finite maintainer harness. It is not part of the
student copy; it controls frames deterministically and does not prove physical typing.
