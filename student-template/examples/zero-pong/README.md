# Zero Pong

A solo Pong match using only Zero's public game, drawing, input and UI APIs.
The player controls the left paddle; a deliberately limited computer controls
the right paddle. The first side to score five points wins.

Copy `Main.java`, `Paddle.java` and `Ball.java` into a current Zero project's
`src/main/java` folder, replacing its previous example classes, then choose
**Run App**. This example needs the current local Zero source with the expanded
`zero.Key` keys; it is not a claim about previously released kit versions.
No image, sound, extra library or direct toolkit code is required.

Choose **Play**, then hold **Up / Down** or **W / S**. Hit the ball near a
paddle's top or bottom to aim it. Choose **Pause**, or press **Space / Escape**
while playing, to freeze the match. Choose **Resume** to continue. Paused
gameplay does not receive canvas keys, so Resume and Restart remain available
as ordinary buttons. Choose **Restart**, or press **R** while gameplay is
active or a result is showing, for a new match. Click the court if a button has
keyboard focus and movement keys do not respond. The buttons also support
normal keyboard focus and activation.

`Main` owns scores, title, HUD, pause, restart, win/loss and explicit updates.
Both paddles extend `Actor`, and Main calls their `update(seconds)` methods.
`Paddle` clamps movement inside the court and draws its rectangle about its
centre. `Ball` extends `Actor`, owns its velocity and wall/paddle bounces, and
draws its circle about its centre. Main splits elapsed time into small steps
before moving and checking collisions. Nothing registers or updates itself.

Ideas for students:

- Change `WINNING_SCORE`, paddle sizes or movement speeds.
- Change when the computer starts following the ball, or its speed/dead zone.
- Experiment with the paddle hit position and outgoing ball angle.
- Add a second human player using A / D, or add a selectable difficulty.
- Add a short sound on a point using Zero's `Sound` and a project-owned asset.

The collision is a simple axis-aligned overlap test around the circle. It is
intended to be readable rather than a general-purpose physics engine. Native
and browser play must be checked using the project's supported build tools;
copying these sources alone does not establish platform compatibility.
