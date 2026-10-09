# 3. Grow a study session

Your goal is to add a data object to an array and trace the app's session state.

## Open and predict

Back up your current work. Copy [study Main](../examples/study/Main.java),
[Question](../examples/study/Question.java) and the original
[shared ScoreDisplay](../examples/shared/ScoreDisplay.java) into `src/main/java/`
using [the switching steps](README.md#before-each-lesson).

Run the original session. Its answers are `3`, `true`, `0`. Predict whether a
wrong answer loses a point and whether Next works before a correct answer. Try
both. Wrong answers can retry; a correct answer awards one point and unlocks Next.
This score counts questions eventually answered correctly, not first-try accuracy.

## Trace the data and state

Question stores a prompt, answer and explanation. Its `accepts()` method compares
the attempted text after trimming spaces and ignoring letter case. Main's
`Question[]` stores references to these ordinary objects.

Find `questionIndex`, `points`, `answered` and `finished`. Explain why the array
starts at index 0 while the displayed question number starts at 1. Trace
`checkAnswer()`, `nextQuestion()`, `showQuestion()` and `restartSession()`.
The boolean guard at the start of `checkAnswer()` prevents duplicate scoring.

## Add one question

Add this entry at the end of the `questions` array in Main. Put a comma after the
previous entry to separate the two objects; keep the final `};` that ends the array.

```java
new Question("What is 9 % 4?", "1", "The remainder after division is 1.")
```

Leave the event handlers unchanged. Find the uses of `questions.length` that make
progress, navigation and the final summary adapt to four questions. Replace your
new question with one on another topic once this version works; update its answer
and explanation together.

## Check the whole session

| Action | Expected result for the four-question version |
| --- | --- |
| Wrong or blank answer | No point lost or gained; retry available; Next disabled |
| Correct answer, then try Check/Enter again | Exactly one point; input and Check disabled; Next enabled |
| Next before the last question | Next prompt; blank input; checking enabled; Next disabled again |
| Answer fourth question, then Next | Completion summary and score 4; no fifth question |
| Restart after completion | First question, score 0, blank input, Check enabled and Next disabled |
| Restart partway through a second run | Same reset behavior; no old score or answer survives |

Finish the second run too. Check ` TRUE ` on the boolean question to test space
and case handling. See [the study app guide](../examples/study/README.md) for the
baseline rules.

## Explain before moving on

Show your new question in a complete run. Explain what one Question object owns,
what Main owns, and how the array length prevents a hard-coded three-question
limit. Record a retry, a final summary and a restart check.
