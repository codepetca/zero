# Build with Zero: Hello, world! and seven lessons

Use ordinary Java to build something you can run, change and explain. This pack
starts with a greeting in a window, then uses the existing example shelf. You
should know variables, `if`, methods and the idea of a class from beginning Java.
Arrays and constructors are practised with worked examples here.

| Lesson | Build and practise | Evidence to keep |
| --- | --- | --- |
| [0. Hello, world!](00-hello-world.md) | Run, change one line and run again | Your changed greeting |
| [1. Say hello with a button](01-hello-button.md) | A button changes an existing label | Your greeting before and after a click |
| [2. Change the quiz](02-quiz.md) | Fields, conditions and button events | Three answer checks and an explanation of the handler |
| [3. Reuse an object](03-objects.md) | Constructors, methods and state versus display | Quiz and tracker results using one shared class |
| [4. Grow a study session](04-study.md) | Question objects, arrays and session state | A new question, complete run and restart |
| [5. Animate an object](05-animation.md) | Coordinates, elapsed time and explicit updates | Comparison of following and jumping |
| [6. Control movement](06-keyboard.md) | Conditions, direction and canvas bounds | Direction predictions and edge checks |
| [7. Make a small improvement](07-project.md) | Plan, implement, check and explain | A small working change with a test record |

Work at your teacher's pace. Lesson 1 is a short click-and-change step.
Each of lessons 2–6 can fit a 45–60 minute class
after setup; lesson 7 may need two classes. These are planning estimates, not
classroom trial results. [Teacher notes](TEACHER.md) include prompts, likely
mistakes, expected results and assessment guidance.

## Before each lesson

First complete [the starter setup](../README.md#first-setup) and
[Lesson 0](00-hello-world.md). Local running does not need a GitHub account. Ask for help with first-time
dependency downloads before starting the lesson clock.

When switching examples:

1. Stop the running app. Save your current `Main.java` and helper classes in a
   separate backup folder **outside `src/`**. A renamed Java file inside `src/`
   can still compile and conflict with the next example.
2. Copy each lesson's listed files from `examples/` into `src/main/java/`.
   Replace Main and the listed helpers. Keep `src/main/java/zero/`, `pom.xml`,
   `zero.json`, both wrappers and `.mvn/`. Do not copy a whole example folder
   into `src/`; use one Main at a time. Remove unused helpers only after backing
   them up.
3. Use **Run App**, or **Ctrl+Shift+B** on Windows/Linux and
   **Command+Shift+B** on macOS with the Zero extension installed. Without Zero,
   use **Tasks: Run Task → Run App without Zero**. Close or Stop the old app and
   run again after editing; a running window does not reload changes.
4. Run the unchanged example first, then make one change at a time. Click the
   canvas before testing keys in the animation and keyboard lessons.

The [API reference](../API.md) explains Zero's methods. JavaFX controls keep
their ordinary JavaFX names. Zero calls app lifecycle methods; your Main calls
methods on your own objects explicitly.

## Keep a small record

For each lesson, write your prediction before running and record what actually
happened. A useful check names the action, expected result and observed result.
Keep the code and a few sentences explaining your change; screenshots can help
show appearance but cannot explain the program on their own.

If your teacher asks for a repository link, follow
[the starter's GitHub and Pika instructions](../README.md#your-repository-and-pika).
Uploads default to simulation. Submit links separately in Pika; copying a link
does not prove a real upload. Repository visibility and teacher access follow
your teacher's instructions.
