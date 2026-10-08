# Build, extract, reuse, contribute

Begin with the default quiz, `src/main/java/Main.java`. Keep changes small enough
to explain to another student. Run after each change. Save your work before
switching examples; the exact copy list is in [README.md](README.md#try-an-example).

1. **Trace execution.** Identify the fields holding state, the objects made in
   setup, and the method called by clicking Check answer. Explain why setup runs
   once, why the handler runs on a click, and why SimpleApp has no draw loop.
2. **Change the quiz.** Change the question and expected string together. Change
   the points awarded. Change VBox spacing/padding or add a hint Label. Try a
   wrong answer, an answer surrounded by spaces, and clicking again after success.
   Parsing numbers and showing invalid-input messages is a later extension.
3. **Extract a component.** Temporarily replace ScoreDisplay with an ordinary
   Label in Main and update its text directly. Then restore ScoreDisplay and
   explain what moved: Main still owns the points and rules; the component owns
   their presentation. No special parent class or registration is needed.
4. **Reuse it.** Copy the practice Main and the same shared ScoreDisplay from the
   README list. Complete twice, reset, then complete once. Change the tracker
   rules without editing ScoreDisplay. Reuse the class by creating separate
   instances: sharing one node between parents is not allowed in JavaFX.
5. **Improve the caption compatibly.** In the shared ScoreDisplay, add a String
   field for the caption and a constructor `ScoreDisplay(String caption)`.
   Preserve `public ScoreDisplay()` and make it call `this("Score")` as its first
   statement. In the new constructor, store the caption, create the Label and
   call setScore(0). Update setScore to display `caption + ": " + points`.
   Copy the improved shared class into src/main/java. The quiz must still use
   `new ScoreDisplay()` unchanged and display “Score: 0” then “Score: 10”. Change
   only the practice Main to `new ScoreDisplay("Completed")` and verify
   “Completed: 0”, “Completed: 2”, reset to zero, and another completion. Keep
   your enhanced practice Main when switching back. The normal verifier checks
   the shipped examples; these custom captions need these checks too.
6. **Animate an ordinary object.** Copy both animation Main and Player exactly
   as listed. Identify the explicit update/draw calls. Replace the smoothing
   formula in Player with `x = targetX; y = targetY;` and compare. Restore it,
   change speed/colour, then try keyboard movement. Click the canvas to play;
   native controls own their input while focused.

## Contribute for another student

Choose one readable example, focused helper, or useful error. Explain the problem
and the resulting behavior. Preserve ordinary Java, explicit object updates,
default constructors used by existing apps, and access to native JavaFX controls.
Keep dependencies pinned. Do not commit target/, caches, credentials or tokens.

Write short copy/run instructions and the behavior to expect. For reusable
components, try at least two apps with separate instances. For the caption
change, record both the unchanged quiz and the customized tracker results.
Run the starter smoke check in README; contributors working in the full kit
also run `python3 scripts/verify-examples.py`. Say which OS/JDK you used and
which checks were actual GUI actions or synthetic events. A compile alone does
not verify focus, layout, or student-machine restrictions.

Use your own repository and Zero's reviewed GitHub workflow; upload is simulated
by default. Submit its link separately in Pika. Ask for teacher/peer review before
another cohort adopts your change. A future shared library release needs a
version and compatibility review so it does not unexpectedly change existing
projects; this starter currently ships readable source.
