# Starter UI API

Import `zero.starterui.StartScreen`, `Hud` and `ScoreDisplay`.

| Class | Constructor | Explicit updates |
| --- | --- | --- |
| StartScreen | `StartScreen(String title, String instructions, Runnable onStart)` | none |
| Hud | `Hud(Runnable onRestart)` | `setScore(int points)`, `setMessage(String text)` |
| ScoreDisplay | `ScoreDisplay()` or `ScoreDisplay(String caption)` | `setScore(int points)` |

All three expose `Node view()`. StartScreen’s Start button and Hud’s Restart
button invoke the supplied action; a null action throws `IllegalArgumentException`
with a useful message. ScoreDisplay defaults to `Score: 0`; a caption such as
`Questions` produces `Questions: 0`. Scores accept all Java int values, including
negative values, without clamping. Hud composes a default-caption ScoreDisplay.
Updates retain each view. Instances have independent nodes and displayed state.
Use on the JavaFX application thread, as with ordinary JavaFX controls.
