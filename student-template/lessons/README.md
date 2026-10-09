# Build with Zero: six short lessons

Use ordinary Java to build something you can run, change and explain. This pack
starts with the quiz already in Zero and uses the existing example shelf. You
should know variables, `if`, methods and the idea of a class from beginning Java.
Arrays and constructors are practised with worked examples here.

| Lesson | Build and practise | Evidence to keep |
| --- | --- | --- |
| [1. Change the quiz](01-quiz.md) | Fields, conditions and button events | Three answer checks and an explanation of the handler |
| [2. Reuse an object](02-objects.md) | Constructors, methods and state versus display | Quiz and tracker results using one shared class |
| [3. Grow a study session](03-study.md) | Question objects, arrays and session state | A new question, complete run and restart |
| [4. Animate an object](04-animation.md) | Coordinates, elapsed time and explicit updates | Comparison of following and jumping |
| [5. Control movement](05-keyboard.md) | Conditions, direction and canvas bounds | Direction predictions and edge checks |
| [6. Make a small improvement](06-project.md) | Plan, implement, check and explain | A small working change with a test record |

Work at your teacher's pace. Each of lessons 1–5 can fit a 45–60 minute class
after setup; lesson 6 may need two classes. These are planning estimates, not
classroom trial results. [Teacher notes](TEACHER.md) include prompts, likely
mistakes, expected results and assessment guidance.

## Before each lesson

First complete [the starter setup](../README.md#first-setup) and run the default
quiz. Local running does not need a GitHub account. Ask for help with first-time
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
