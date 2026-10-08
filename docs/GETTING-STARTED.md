# Getting started with Zero

Zero is a local Java kit: edit ordinary Java in VS Code, then open your app in a
separate JavaFX window. The kit contains `zero-0.3.0.vsix`, `Zero.code-profile`,
optional keyboard shortcuts and `zero-starter.zip`. This MVP still needs physical
Windows/Linux, real GitHub authentication/upload and novice classroom trials.
See [verification evidence](VERIFICATION.md) for checks actually completed.

## One-time setup

1. Install VS Code and a supported **JDK 17 or later**; install Git for repository
   work. JDK 17 was tested. Check `java -version`, `javac -version` and
   `git --version` in a new terminal, then restart VS Code. The Java extension's
   runtime does not replace your project's build JDK; follow its setup help if
   it needs a newer editor JDK.
2. Optionally import **Zero.code-profile first** through VS Code Profiles. It
   contains settings only, defaults to light and enables 500 ms autosave.
   In the chosen profile, install **zero-0.3.0.vsix** through
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
   Record school proxy/firewall problems with your teacher; do not place
   credentials in the project to work around them.

## Edit and run

Start with `src/main/java/Main.java` and `ScoreDisplay.java`. The default quiz
uses ordinary JavaFX controls: `settings()` configures the window and `setup()`
builds the interface with `show(...)`. Button handlers call ordinary methods
that update the quiz state and score display.

Try the practice tracker to reuse ScoreDisplay. Try animation, keyboard or
drawing to use `SketchApp`: it runs `update(seconds)` then `draw()` each frame;
Main explicitly calls methods on Player or Mover. The counter uses native
controls. Follow the extracted starter's `README.md` for exact copy instructions;
choose one example at a time and keep alternatives outside compiled `src/`.

With the profile, autosave runs after 500 ms. **Run App** also saves files, cleans
and compiles the project, and restarts the app. Use **Ctrl+Shift+B** on Windows/Linux
or **Cmd+Shift+B** on macOS for the same default build task. There is no hot reload.
**Stop** ends the owned run; the app lives in its own native window.

Read compiler errors in the task terminal and Problems panel; open the indicated
source line. See **Setup help** for missing local tools. F6/F7 are optional:
merge `optional-keybindings.json` into your keyboard shortcuts if wanted.

To change appearance, run **Preferences: Color Theme** in the Command Palette.
The sidebar supports dark themes too. To return to an imported profile, run
**Profiles: Switch Profile → Zero**, then **Zero: Show Sidebar**.

## Your GitHub repository

Local running needs no GitHub sign-in. For sharing work, follow your teacher's
privacy, visibility and account instructions:

1. Choose **Sign in to GitHub** in Zero and complete VS Code's native browser
   authentication flow. Check the account shown in the sidebar. Canceling or
   denying authentication leaves local running available; retry sign-in when ready.
2. Choose **Create Repository** while signed in. This opens GitHub's new-repository
   page. Create your **own empty repository**, leaving README, license and
   gitignore uninitialized to avoid a separate starting history. This workflow
   does not use GitHub Classroom.
3. Choose **Connect Repository** and paste its HTTPS page URL. Zero initializes
   Git in this standalone student folder if needed and adds its origin remote;
   it asks before replacing an existing origin. Connecting does not upload or
   verify repository ownership, existence or access.
4. Set your Git commit identity if needed, using your own name and email under
   your teacher's privacy instructions. These commands configure this repository
   only, from the student folder:

   ```sh
   git config user.name "Your Name"
   git config user.email "your-email@example.com"
   ```

Signing in does not set Git's commit identity. Zero uses the selected native
GitHub session for live upload and checks that the session is still current.
Never put passwords or tokens in project files. If an account/session changes
during review, sign in as needed and review the upload again.

**Upload to GitHub defaults to simulation**: nothing is staged, committed or
uploaded. For a teacher-authorized real trial, set the workspace setting
`"zero.uploadMode": "live"`. Upload saves your files, asks for a short commit
message, then shows a modal review of repository, branch and changed files.
Check the destination and files before choosing **Commit & Upload**; cancel if
anything is wrong. A successful upload creates a local commit when needed,
pushes it, and confirms the remote branch. A failed upload may leave a local
commit, so read the error and inspect the repository before retrying.

After a successful real upload, open GitHub and check the remote files and commit.
Use **Copy Repository Link** and paste the link separately into the assignment
in **Pika**. Give your teacher access if the repository is private. Copying a URL
does not upload code, establish that the remote is current or submit in Pika.

## Before a class adopts it

Use the [classroom pilot checklist](CLASSROOM-PILOT.md) on a student machine.
Real sign-in/upload and physical Windows/Linux execution remain unverified;
automated authentication and transport checks use mocks.

For a contribution, propose one readable helper or example, explain how to try
it and include the checks you ran. The first reusable-component exercise can add
a caption constructor to ScoreDisplay while retaining its no-argument constructor:
the quiz keeps working and the tracker can display “Completed”. Review the change
with the teacher and verify both apps before a cohort adopts it. Ordinary Java
packages, interfaces and JavaFX properties are available as later steps.
