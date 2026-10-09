# Java study session

Stop your app and save your current Main and helpers outside `src/` before
switching examples. Copy these exact files into `src/main/java/`:

- `examples/study/Main.java`
- `examples/study/Question.java`
- `examples/shared/ScoreDisplay.java`

Keep the `zero/` framework folder, Maven wrappers, `pom.xml` and `zero.json`.
Run App as usual, or run `./mvnw clean compile javafx:run` from the starter folder
(`.\mvnw.cmd clean compile javafx:run` on Windows). The example shelf is outside
compiled source: copying only Main is not enough because it uses Question.

Try a wrong answer, then a correct one. Wrong answers allow unlimited retries
without losing points. Matching ignores surrounding spaces and letter case.
Each correct answer earns one point, locks the input and Check button, and
unlocks Next. Pressing Enter also checks an answer. Next shows the next question;
after the last correct answer, Next shows your final summary. Restart works at
any point and clears the score, answer and feedback, returns to question one,
enables answer checking and locks Next again. The answers are `3`, `true`, `0`.
The score counts questions eventually answered correctly; it is not a measure
of first-attempt accuracy.

Main owns an ordinary `Question[]` array and explicitly calls Question methods.
Each Question holds its prompt, expected answer and explanation. Add another
`new Question(...)` to the array to extend the session; progress and the final
summary use the array's length. Change the prompts, explanations or answers to
study another topic. Main's small event-handler methods own all session state.
SimpleApp only starts the window and displays the JavaFX layout.

ScoreDisplay is the exact same source used by the default quiz and practice
tracker. Copy the canonical shared file without changing it for this app.
`new ScoreDisplay()` keeps the quiz's `Score` caption; the practice tracker uses
`new ScoreDisplay("Completed")`. It is an ordinary Java object with a label,
a constructor and methods, rather than a registered framework component. Main
owns the number and calls `setScore(...)`; ScoreDisplay only displays it.
Each running app creates its own object because a JavaFX node has one parent.

The contributor's finite GUI checks cover retries, once-only scoring, advancing,
completion, restarting and reuse of both captions. These use synthetic events
in real JavaFX windows; novice students and physical classroom input have not
been tested.
