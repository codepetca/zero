# Building with Zero

The first app-building pass grows the tiny quiz into a study app using the same
local starter, SimpleApp and ordinary JavaFX controls. It is an example students
can copy and extend; the beginner starter still opens the original one-question
quiz. [Copy/run instructions](../student-template/examples/study/README.md) ship
inside the starter ZIP.

## What the app should teach

- Question objects hold prompts and expected answers in an array.
- Main holds the current index, total and per-question completion state.
- Event handlers check an answer, move to the next question and restart.
- ScoreDisplay owns a label and presents Main's total. Each app creates its own
  instance. The quiz, study app and tracker use the same component source.
- A caption constructor lets the tracker display “Completed” while the original
  quiz keeps its no-argument constructor and “Score” display.

Wrong answers can retry. A correct answer counts once and unlocks Next. The last
question leads to a summary; Restart clears input, feedback, progress and score.
This app practices objects, arrays, conditions, methods and event-driven state.
It has no accounts, external services or automatic Pika submission.

## Keep improvements grounded in use

Question is specific to the study app; it does not belong in the framework yet.
Question navigation is a few app methods, so a router or screen base class is
unnecessary for this example. Native Label, TextField, Button and layouts already
provide the controls. Reuse is demonstrated by a separate practice app rather
than a new component-registration mechanism.

When building another app, keep a short note of repetitive or confusing code.
Extract a helper only when its responsibility is clear, and try it in more than
one app before promoting it into shared framework code. Keep existing constructors
working. A readable example is a useful contribution in its own right.

## Verification record

Completion evidence is recorded in [VERIFICATION.md](VERIFICATION.md). Finite
GUI checks exercise the app with synthetic events; they are not a novice student
trial. The owner chose to skip student trials for this phase. Physical
Windows/Linux, school setup and direct JavaFX typing/clicking remain unverified.
The existing native GitHub teacher-pilot evidence covers the upload workflow;
dogfooding does not perform another upload or Pika submission.
