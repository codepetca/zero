# Getting started with Zero

Zero is a local Java kit: edit ordinary Java in VS Code, then open your app in a
separate JavaFX window. The kit contains `zero-0.2.0.vsix`, `Zero.code-profile`,
optional keyboard shortcuts and `zero-starter.zip`. This is a local prototype;
real GitHub authentication/upload and classroom pilots still need verification.

## One-time setup

1. Install VS Code, Git and a supported **JDK 17 or later**. JDK 17 was tested.
   Check `java -version`, `javac -version` and `git --version` in a new terminal,
   then restart VS Code. The Java extension's runtime does not replace your
   project's build JDK; follow its setup help if it needs a newer editor JDK.
2. Import **Zero.code-profile first** through VS Code Profiles. It contains
   settings only. In that profile, install the local `zero-0.2.0.vsix` through
   **Extensions → Install from VSIX…**, then install **Language Support for Java
   by Red Hat** (`redhat.java`) and **Debugger for Java**
   (`vscjava.vscode-java-debug`). Zero is not published in the Marketplace.
3. Extract `zero-starter.zip` into your own folder, outside any other Git
   repository. Open the extracted **zero-starter folder**, rather than a single
   Java file. Keep its hidden `.mvn` and `.vscode` folders. Trust it only after
   checking its source and build scripts.
4. Choose **Zero: Show Sidebar** in the Command Palette, then **Run App**.
   The first build needs internet to download Maven and JavaFX. Students do not
   need Node.js, global Maven or a separate JavaFX installation. On macOS/Linux,
   a ZIP that loses executable permissions may need `chmod +x mvnw` once.

## Edit and run

Start with `src/main/java/Main.java` and `Player.java`. Main explicitly updates
and draws an ordinary Player object. Try the keyboard, counter and drawing
examples using the copy instructions in the starter README; they are alternatives
outside the compiled source folder.

Autosave runs after 500 ms. **Run App** also saves files, cleans and compiles the
project, and restarts the app. Use **Ctrl+Shift+B** on Windows/Linux or
**Cmd+Shift+B** on macOS for the same default build task. There is no hot reload.
**Stop** ends the owned run; the app lives in its own native window.

Read compiler errors in the task terminal and Problems panel; open the indicated
source line. See **Setup help** for missing local tools. F6/F7 are optional:
merge `optional-keybindings.json` into your keyboard shortcuts if wanted. They
are separate from the profile.

To change appearance, open the Command Palette and run **Preferences: Color Theme**.
To return to this setup, run **Profiles: Switch Profile → Zero**, then
**Zero: Show Sidebar**. Switching profiles and showing a sidebar are separate actions.

## Your GitHub repository

Local running needs no GitHub sign-in. For sharing work:

1. Create your **own empty GitHub repository**, using your teacher's visibility
   instructions. Leave its README, license and gitignore uninitialized to avoid
   a separate starting history. This workflow does not use GitHub Classroom.
2. Choose **Connect Repository** and paste its HTTPS page URL. Zero initializes
   Git in this standalone student folder if needed and adds its origin remote;
   it asks before replacing an existing origin. Connecting does not authenticate
   or upload, and does not verify repository ownership or existence.
3. Set your Git commit identity if needed, using your own name and email. From
   your student folder, these commands configure that repository only:

   ```sh
   git config user.name "Your Name"
   git config user.email "your-email@example.com"
   ```

4. Configure a standard Git credential helper/browser authentication flow with
   your teacher's guidance. Zero uses the installed Git process for HTTPS
   uploads. VS Code's GitHub UI sign-in alone may not configure credentials for
   that separate process. Never put passwords or tokens in project files.

**Upload to GitHub defaults to simulation**: nothing is staged, committed or
uploaded. To use the implemented real-upload path, set the workspace setting
`"zero.uploadMode": "live"`. Upload saves your files, asks for a short commit
message, then shows a modal review of the repository, branch and changed files.
Check that review before choosing **Commit & Upload**. It creates a local commit
when needed and pushes using normal Git HTTPS transport; ignored files stay
local. If authentication or upload fails, read the error. A local commit may
already exist, so check the repository before retrying.

After a successful real upload, open your GitHub repository and check your files.
Use **Copy Repository Link** and paste the link separately into the assignment
in **Pika**. Give your teacher access if the repository is private. Copying a URL
does not upload code or submit anything in Pika.

## Before a class adopts it

The imported profile and interactive workflow have been checked on macOS.
Physical Windows/Linux runs, real GitHub authentication/transport and student
pilots remain unverified. See [verification evidence](VERIFICATION.md). Try one
student machine and one small app before a cohort adopts the kit; report the
operating system, setup steps, result and any useful error message.

For a contribution, propose one readable helper or example, explain how to try
it and include the checks you ran. Review it with the teacher before sharing it
with a cohort; preserve ordinary Java and explicit object updates.
