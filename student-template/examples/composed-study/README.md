# Study app with shared start and HUD views

Create a fresh local project from a Zero starter, separate from your other apps. Copy these exact files (paths are relative to the starter folder):

| From | To |
| --- | --- |
| `examples/composed-study/Main.java` | `src/main/java/Main.java` |
| `examples/study/Question.java` | `src/main/java/Question.java` |
| `examples/composition-shared/StartScreen.java` | `src/main/java/StartScreen.java` |
| `examples/composition-shared/Hud.java` | `src/main/java/Hud.java` |
| `examples/shared/ScoreDisplay.java` | `src/main/java/ScoreDisplay.java` |

Question and ScoreDisplay are the existing canonical sources; this directory
does not duplicate them. StartScreen and Hud are exactly the same sources used
by [the composed game](../composed-game/README.md). For the first comparison,
copy all four helpers unchanged. When testing your own component edits, keep
the backup and deliberately reuse your edited source in both examples instead.
No resources, Maven changes or installed Community library are needed.

Run App, or run `./mvnw clean compile javafx:run` from the starter folder
(`.\mvnw.cmd clean compile javafx:run` on Windows). The example shelf is outside
compiled source; copying only Main is not enough.

The window begins with a welcome and Start button. Choose Start to show question
one and `Score: 0`. Try a wrong or blank answer; retry without losing points.
The answers are `3`, `true`, `0`, and matching ignores case and surrounding
spaces. Each correct answer scores once, disables Check and input, and enables
Next. Enter also checks the answer. After the third answer, Next shows completion,
the final score and the same Hud with Restart. Restart after a wrong answer,
one correct answer and completion: it returns to question one, clears the score
and answer, and enables Check while disabling Next. Complete a second session.

Main creates both shared views and its activity controls once in setup. Start
and Restart call Main's `restartSession()`; Main resets its fields and updates
the existing controls. Main owns Question[], retries, points, advance and
completion. Hud owns presentation and forwards points to its ScoreDisplay.
App's `show(...)` displays the welcome or activity; it does not remember
session state. Completion updates the activity view instead of rebuilding it.

See [the shared view contract](../composition-shared/README.md) for the optional
Runnable/lambda explanation and separate-instance rule. Try longer prompts and
messages; labels wrap. These are local source examples, not published package
versions or evidence of physical Windows/Linux classroom testing.
