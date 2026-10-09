# 6. Make a small improvement

Your goal is to plan, build and explain one useful change using what you already
understand. Start from a saved lesson app or copy its original example files using
[the switching steps](README.md#before-each-lesson).

## Choose a small goal

Choose one of these or agree on a similarly small change with your teacher:

- **Study:** replace the questions with a four-question revision set for another
  subject. Write helpful explanations; preserve retry, once-only scoring and restart.
- **Tracker:** add an “Undo one” button that subtracts one completion while never
  allowing the count below zero. Keep Main in charge of the number.
- **Movement:** add A, W and S alternatives to the remaining arrow controls,
  using the same either-key pattern as lesson 5. Simultaneous equivalent keys
  should not double speed; preserve bounds and focus behavior.

One finished behavior is enough. Use ordinary Java, native controls or the existing
SketchApp methods. Keep explicit object updates and the supplied dependencies.
The separate simple-game example is optional future material; this lesson does
not depend on it being available.

## Write a plan before editing

Write three short sentences:

1. A person can now do ______.
2. I expect to change ______ in these files: ______.
3. I will know it works when ______, and I will also check ______.

Name the app state and the object that presents or draws it. Decide what should
happen for an ordinary action, a boundary case and a reset or fresh run. Then make
one change, Run App and compare the result with your plan. Keep a working backup.

## Keep evidence

Use this record for at least three checks, including a boundary case:

| Action/input | Expected result | Observed result | Pass/fail |
| --- | --- | --- | --- |
| An ordinary use of the new feature | | | |
| A boundary or repeated action | | | |
| Reset or Stop/Run, then use it again | | | |

For Undo, try zero → Undo, two completions → Undo, then Reset → Undo. For the
study set, complete every question and restart partway through a second run.
For movement, try equivalent keys together and all four canvas edges.

A successful compile is one check; running the changed behavior is another.
Record your OS and distinguish actions you actually tried from predictions.

## Give a short walkthrough

Submit the changed Java files, your plan and check record in the form your teacher
requests. Explain one field, one condition, one method call and one decision about
which class owns the behavior. Demonstrate the boundary case. Identify a bug you
repaired or one confusing idea you can now explain.

If you propose a reusable helper, include exact copy/run instructions and try it
in two apps with separate instances. Keep existing constructors working. Seek
teacher/peer review before other students adopt it. Follow
[the repository and Pika instructions](../README.md#your-repository-and-pika) only
when your teacher requests that submission flow; local lesson work does not
require an upload.
