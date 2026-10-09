# Teacher notes: Build with Zero

This sequence is for students who have begun Java fundamentals through CodeHS.
It introduces runnable interfaces and canvas apps without requiring prior
Greenfoot or Processing experience. Its aim is small changes students can trace,
check and explain. Use the [student index](README.md) as the entry point.

## Preparation and pacing

Complete installation on a target school machine before the first lesson. Allow
extra time for downloads, the JDK/editor setup and canvas focus. The existing
[starter setup](../README.md#first-setup) is authoritative. Physical Windows/Linux,
school restrictions and novice classroom trials remain pending; this pack has
not been trialled with students. A prior Mac teacher upload trial does not prove
school-machine readiness.

Plan 45–60 minutes for each of lessons 1–5 after setup, and one or two classes for
lesson 6. Shorten by assigning only the required changes; extend with optional
experiments. A useful rhythm is predict, run the baseline, trace together, change
one thing, check, then explain. Pace to actual student evidence.

Teach `setOnAction(event -> method())` as the connection between a click and an
ordinary method before teaching full lambda syntax. Students need constructors,
fields and method calls for lesson 2; introduce array indexes before lesson 3.
Students can trace `Math.min`/`Math.max` with numbers before generalising the bounds
formula. Leave packages, interfaces and JavaFX properties for a demonstrated need.

## Expected understanding and feedback

| Lesson | Evidence to listen for | Useful intervention |
| --- | --- | --- |
| 1. Quiz | setup creates controls once; a click calls checkAnswer; Main owns points; disabled checking stops another award | Ask the student to point to the handler connection and the statement changing points |
| 2. Objects | Main changes the number; ScoreDisplay changes label text; both constructors still work | Ask “If we change points per click, which class changes?” |
| 3. Study | Question owns data; Main owns index and completion flags; length controls navigation | Trace one wrong answer, one correct answer and Next on paper |
| 4. Animation | Main calls update and draw; elapsed time differs from a frame count; circle coordinates are its centre | Ask what would happen if the Player update call disappeared |
| 5. Keyboard | Separate conditions combine keys; time scales distance; radius keeps the whole circle inside | Calculate one update, then one clamped edge result |
| 6. Improvement | Goal, ownership, boundary check and actual behavior agree | Ask for the smallest demonstration that could disprove their claim |

## Concrete expected results

**Quiz:** the changed `8 + 5` version accepts trimmed `13`, awards 5 once and
resets on a fresh run. Wrong/blank input keeps 0 and permits retry. The repaired
semicolon exercise should return to a runnable program. Do not grade an exact
compiler-message string; locations and wording can vary.

**Objects:** the baseline tracker gives 1, 2, 0, 1. With two per click it gives
2, 4, 0, 2. The student's format experiment should show `Completed = 0` at startup
and after reset, and `Completed = 2` after one changed tracker click. The original
quiz Main with that same display should show `Score = 0`, then `Score = 10`.
Changing both initial text and setScore avoids a format that changes after the
first action. Changing a display never changes Main's scoring rule.

**Study:** four questions finish with 4 points after eventual correct answers.
Wrong attempts do not penalise; Check and Enter cannot add another point after
success. Next is locked until success. Restart, including mid-session, returns
to index 0, points 0 and an enabled blank answer with Next disabled. The new
remainder answer is 1. Accept other well-formed questions with verified answers.

**Animation:** x=100, targetX=200, amount=0.1 produces x=110. Direct assignment
jumps to the target. Factor 8 catches up faster than 2 for the same elapsed time;
it is a proportional following factor, not a constant pixel speed. Without the
background clear, prior drawings remain. Updates are explicit Java calls.

**Keyboard:** right/up gives (1, -1), left/right gives (0, 0). At 180 pixels per
second, 0.05 seconds means 9 pixels on an active axis before clamping. Radius 28
on a 640 × 400 canvas means x in [28, 612] and y in [28, 372]. The either-key
condition increments once when D and Right are both held. Diagonal movement is
faster in this baseline; equal diagonal speed is an optional later mathematical
extension, not a required fix for the lesson.

**Project:** an Undo button should leave zero at zero. A straightforward handler
uses `if (completed > 0) completed--;` followed by `score.setScore(completed)`;
wire a separate Button into setup and the VBox. Do not place counting logic in
ScoreDisplay. Accept another implementation if ordinary actions, zero, repeated
Undo and reset pass and the student can explain it.

## Common mistakes

- Multiple Main files in compiled `src/`: stop and back up outside `src/`, then
  copy only the listed files. Renaming a Java file in place is not a safe backup.
- Editing an example shelf file but running the unchanged compiled copy: point
  to `src/main/java/` and rebuild. Save the compiled work before switching.
- Copying only Main: study also needs Question; quiz/practice/study need the
  shared ScoreDisplay. The animation and keyboard apps need their object class.
- Assuming an edited source changes a running window: Stop, then Run App again.
- Keys seem broken: click the canvas; another control/window can own focus.
  Local running and keyboard focus have no dependency on GitHub sign-in.
- Replacing text `equals` with `==`: return to content comparison. In study,
  `equalsIgnoreCase` and trim are in Question.accepts, not the score display.
- Changing an array prompt without its answer or omitting an entry separator:
  inspect that Question constructor and the comma between entries.
- Treating every method named update as automatic: ask where Main calls it.

## Assess a small working change

Use the following evidence for formative feedback or adapt it to your course.
No prescribed percentage weighting or Pika grade changes are part of this pack.

| Criterion | Ready evidence | Needs another attempt |
| --- | --- | --- |
| Behavior | Stated change works and the existing required behavior still works | Change is incomplete or breaks retry/reset/bounds |
| Understanding | Student traces state and calls in their own words | Explanation only describes appearance or repeats comments |
| Checking | Actual normal, boundary and repeat/reset results are recorded | Compile alone, screenshots alone or untried predictions |
| Readability | Small ordinary Java methods and clear responsibility | Unexplained code, duplicated scoring or hidden object updates |

Allow explanation through a live walkthrough, short written trace or another
accessible format. Keep check actions concrete. Separate setup friction from the
student's understanding of Java. Pair discussion can support learning; ask each
student to explain their own changed behavior.

## Submission and future integration

Students own their repositories and submit requested links separately in Pika.
Repository creation/sign-in/live uploads follow explicit teacher instructions;
simulation is the default. Check the remote files and teacher access when using
a real repository submission. Do not ask for passwords or tokens in lesson records.

These new lesson files can travel with a future starter distribution because they
live inside `student-template/`. This task does not regenerate or publish the existing versioned archives.
Integrate the lessons into the next approved kit rather than replacing released assets.
The separately developed simple game is an optional follow-on after lesson 5;
the six lessons stand on existing examples without it.
