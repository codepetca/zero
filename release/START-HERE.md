# Start with Zero

1. Install a supported **JDK 17+** and **VS Code**. Your first build needs internet
   for Maven and JavaFX downloads. Students do not need Node.js or global Maven.
2. Optionally import **optional/Zero.code-profile** through VS Code Profiles
   **before installing extensions**. In your chosen profile, use the Command
   Palette (**Ctrl+Shift+P** on Windows/Linux, **Command+Shift+P** on macOS):
   **Extensions: Install from VSIX…** → select **zero-0.5.3.vsix** beside this
   file; then **Extensions: Install Extensions** → install **Language Support
   for Java by Red Hat** (`redhat.java`) and **Debugger for Java**
   (`vscjava.vscode-java-debug`). These Java extensions provide editor errors
   and debugging support.
3. In VS Code, open the **starter** folder beside this file. Keep the whole folder
   together, including its hidden `.mvn` and `.vscode` folders.
4. Open **starter/lessons/00-hello-world.md** (Lesson 0: Hello, world!), then
   `src/main/java/Main.java`. Use **Zero: Run App** to see **Hello, world!**.
   Change the greeting to **Hello, Java!**, then Save, Stop and Run App again.
5. Continue with Lessons 1–12 in **starter/lessons/README.md**.
   **starter/README.md** covers running, examples and GitHub;
   **starter/API.md** describes the readable framework in your project.

The optional profile uses a light theme and autosave. The optional keybindings
file contains F6/F7 shortcuts you can add yourself.

Zero opens the first lesson's preview once per project when the editor is empty.
Use **Zero: Open First Lesson** in the Command Palette to reopen it. A failed
Zero run offers **Show Problems** to reach source errors.

From a terminal inside starter, run **./mvnw clean compile javafx:run**.
On Windows use **.\mvnw.cmd clean compile javafx:run**.

Running locally needs no GitHub account. Upload, Start and Finish default to
simulation. Follow teacher visibility instructions before creating your own
repository or enabling live uploads. Submit the repository link separately in Pika.

The Component Workshop is a separate optional download. The starter already
includes readable examples and editable ordinary Java framework source.
