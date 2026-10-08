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
5. **Trace a compatible contribution.** ScoreDisplay now accepts a caption:
   `new ScoreDisplay("Completed")`. Read how the no-argument constructor calls
   `this("Score")` so the original quiz still works unchanged. Try the quiz's
   “Score: 0” then “Score: 10”, and the tracker's “Completed: 0” then
   “Completed: 2”. Reset and complete again. Explain why changing presentation
   belongs in this component while changing the scoring rule belongs in Main.
   Propose a small presentation improvement and try it in both apps.
6. **Grow the study app.** Copy its Main, Question and the shared ScoreDisplay
   exactly as listed in README. Trace the question array, current index and
   event handlers. Add one Question to the array without changing the handlers.
   Try a wrong answer, success, another check, Next, the final summary and
   Restart. Verify the new question appears and the score resets. See the
   [study guide](examples/study/README.md) for the rules and reusable objects.
7. **Animate an ordinary object.** Copy both animation Main and Player exactly
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
