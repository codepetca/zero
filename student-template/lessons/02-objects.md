# 2. Reuse an ordinary object

Your goal is to reuse ScoreDisplay and explain the difference between owning a
number and displaying it.

## Open and predict

Back up lesson 1 outside `src/`. Copy [practice Main](../examples/practice/Main.java)
and [shared ScoreDisplay](../examples/shared/ScoreDisplay.java) into
`src/main/java/`, following [the switching steps](README.md#before-each-lesson).
Keep the shared source unchanged for the first part of this lesson.

Predict the displayed count after Complete, Complete, Reset, Complete. Run the
tracker and check for 1, 2, 0, 1. The button's full label is “Completed an exercise”.

## Trace the two objects

Read `completeExercise()` and `resetProgress()` in Main. Main changes `completed`
and then asks the display to show it. ScoreDisplay does not count exercises.

```java
score = new ScoreDisplay("Completed");
score.setScore(completed);
```

Find the constructor that stores the caption and creates a Label. Find `view()`:
it returns the label so Main can put it in a VBox. ScoreDisplay is an ordinary
class, with no Zero parent class or registration step.

The quiz uses `new ScoreDisplay()`. Its no-argument constructor calls
`this("Score")`, preserving the quiz's caption. Each app creates its own display
object; one JavaFX node cannot belong to two different parents at once.

## Change the app, then the presentation

1. In practice Main, make each click count two completed exercises and change
   the button label to describe that rule. Leave ScoreDisplay unchanged.
2. Check two clicks, Reset and one click: expect 2, 4, 0, 2.
3. Back up the working tracker. In your copied `src/main/java/ScoreDisplay.java`,
   change the display format from `Completed: 2` to `Completed = 2`. Update both
   the initial Label text and `setScore()` so the format is consistent at zero
   and after changes. Keep both constructors and method signatures.
4. Keep that modified display in place. Copy only the original quiz Main into
   `src/main/java/Main.java`. Run it: expect `Score = 0`, then `Score = 10` after
   answering `42`. Restore your tracker Main and check Reset again.

Your experiment is in your compiled copy. Keep the original example shelf intact
so later lessons can copy its baseline. Save the modified class outside `src/`
before switching to another example. A proposed shared contribution needs review
before replacing the canonical example source.

## Explain before moving on

Show the same modified class working in the quiz and tracker. Identify one change
that belonged in Main and one that belonged in ScoreDisplay. Explain why removing
the no-argument constructor would break the quiz. Record both initial and changed
display results, including Reset.
