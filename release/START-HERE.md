# Start with Zero

1. Install a supported **JDK 17+** and **VS Code**. Your first build needs internet
   for Maven and JavaFX downloads. Students do not need Node.js or global Maven.
2. Optionally import **optional/Zero.code-profile** through VS Code Profiles
   **before installing extensions**. In your chosen profile, use the Command
   Palette (**Ctrl+Shift+P** on Windows/Linux, **Command+Shift+P** on macOS):
   **Extensions: Install from VSIX…** → select **zero-0.5.2.vsix** beside this
   file; then **Extensions: Install Extensions** → install **Language Support
   for Java by Red Hat** (`redhat.java`) and **Debugger for Java**
   (`vscjava.vscode-java-debug`). These Java extensions provide editor errors
   and debugging support.
3. In VS Code, open the **starter** folder beside this file. Keep the whole folder
   together, including its hidden `.mvn` and `.vscode` folders.
4. Open **starter/lessons/01-quiz.md** (Lesson 1: Change the quiz), then
   `src/main/java/Main.java`. Use **Zero: Run App** to open the quiz. Change the
   question **and its matching expected answer**: for “What is 8 + 5?” in
   `setup()`, change `equals("42")` to `equals("13")` in `checkAnswer()`.
   Save, Stop and Run App again. Try an incorrect answer and the correct answer.
5. Continue with the six lessons in **starter/lessons/README.md**.
   **starter/README.md** covers running, examples and GitHub;
   **starter/API.md** describes the readable framework in your project.

The optional profile uses a light theme and autosave. The optional keybindings
file contains F6/F7 shortcuts you can add yourself.

Local upcoming extension changes open Lesson 1's preview once per project and
add **Zero: Open First Lesson** in the Command Palette to reopen it. A failed
Zero run offers **Show Problems** to reach source errors. These changes are not
in the published 0.5.2 VSIX; with that version, open the lesson file yourself
and use **View: Toggle Problems** from the Command Palette if a build fails.

From a terminal inside starter, run **./mvnw clean compile javafx:run**.
On Windows use **.\mvnw.cmd clean compile javafx:run**.

Running locally needs no GitHub account. Upload, Start and Finish default to
simulation. Follow teacher visibility instructions before creating your own
repository or enabling live uploads. Submit the repository link separately in Pika.

The Component Workshop is a separate optional download. The starter already
includes readable examples and editable ordinary Java framework source.
