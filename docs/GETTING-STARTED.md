# Getting started with Zero

Zero is a local Java kit: edit ordinary Java in VS Code, then open your app in a
separate JavaFX window. Extract the kit once to find `START-HERE.md`, the ready
`starter/` folder, `zero-0.5.2.vsix` and an `optional/` folder containing the profile
and keyboard shortcuts. The separate starter-only ZIP is also available locally.
This MVP still needs physical
Windows/Linux and novice classroom trials. A Mac teacher trial verified the
native sign-in and repository upload path.
See [verification evidence](VERIFICATION.md) for checks actually completed.

## One-time setup

1. Install VS Code and a supported **JDK 17 or later**; install **Git 2.31 or newer** for repository
   work. JDK 17 was tested. Check `java -version`, `javac -version` and
   `git --version` in a new terminal, then restart VS Code. The Java extension's
   runtime does not replace your project's build JDK; follow its setup help if
   it needs a newer editor JDK. The normal platform-specific Java extension bundles
   its tooling runtime on supported Windows/macOS/Linux platforms. Universal
   builds and other platforms currently need a Java 25+ tooling JDK; see the
   [Java extension setup](https://github.com/redhat-developer/vscode-java#quick-start).
2. Optionally import **optional/Zero.code-profile first** through VS Code Profiles. It
   contains settings only, defaults to light and enables 500 ms autosave.
   In VS Code 1.141, open **Preferences: Open Profiles (UI)**, choose the menu
   beside **New Profile → Import Profile… → Select File…**, then **Create** and
   **Use this Profile for Current Window**. In the chosen profile, install **zero-0.5.2.vsix** through
   **Extensions → Install from VSIX…**, then install **Language Support for Java
   by Red Hat** (`redhat.java`) and **Debugger for Java**
   (`vscjava.vscode-java-debug`). Zero is not published in the Marketplace.
3. Move or copy the kit's **starter folder** into your own location, outside any
   other Git repository. For the separate starter-only ZIP, extract its
   **zero-starter folder** instead. Open that folder, rather than a single
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
merge `optional/optional-keybindings.json` into your keyboard shortcuts if wanted.

To change appearance, run **Preferences: Color Theme** in the Command Palette.
The sidebar supports dark themes too. To return to an imported profile, run
**Profiles: Switch Profile → Zero**, then **Zero: Show Sidebar**.

## Your GitHub repository

Local running needs no GitHub sign-in. For sharing work, follow your teacher's
privacy, visibility and account instructions:

1. Click the profile icon beside **GitHub** in Zero and complete VS Code's native
   browser authentication flow. It becomes the account's first letter; hover
   or focus it to identify the account. Click it for **Change GitHub account…**
   or **Sign out…**. Sign out opens VS Code Accounts; select the GitHub account
   there and choose Sign Out. Canceling or
   denying authentication leaves local running available; retry sign-in when ready.
2. Choose **Connect a repo → Create a repository…**. This opens GitHub's new-repository
   page. Create your **own empty repository**, leaving README, license and
   gitignore uninitialized to avoid a separate starting history. This workflow
   does not use GitHub Classroom.
3. Return to **Connect a repo → Connect an existing repository…** and paste its
   HTTPS page URL. Zero initializes
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

## Your individual workflow

`main` holds completed work. A change branch holds your next improvement.
**Upload changes defaults to simulation**: nothing is saved in Git or uploaded.
Start and Finish also simulate without changing branches. To use real repository
actions, set the workspace setting `"zero.uploadMode": "live"` when your teacher
is ready for the trial. Local Run works in either mode.

For a new repository, **Upload changes once on main** to save and upload the
starter. Enter a short commit message and check the account, repository, branch
and files before **Commit & Upload**. This is the starting version.

For each improvement:

1. Click **main → Start a change**. Give it a short name such as `quiz-feedback`
   using lowercase letters, numbers and dashes. Review before creating the branch.
   Upload pending edits first. Zero updates main from GitHub when it can do so
   without combining separate histories, then creates the branch.
2. Edit and **Run App**. Check your change.
3. **Upload changes** to save a Git commit and upload progress to this branch.
   Describe what changed and review before **Commit & Upload**. You can repeat
   this while building; it does not yet add the change to main.
4. Click the branch name → **Finish change**. Upload any pending edits first.
   Check the preview before approving the merge and upload to main. If GitHub
   has newer main changes, Zero incorporates them into your change branch and
   pauses. Run the combined app, then choose Finish change again for a fresh
   review before uploading it to main.
5. After confirmed success, Zero returns to main. You can remove the finished
   local branch when prompted, or keep it. Its GitHub branch remains available.

If an update creates conflicts, Zero keeps your work and opens VS Code's Source
Control. Open the conflicted files or Merge Editor, inspect both changes and
choose/edit the combined result. Save, stage the resolved files and commit the
merge through Source Control. Run the app, then choose **Finish change** again
for a fresh review. Ask your teacher if the correct result is unclear.

A failed upload can leave a local commit. A failed Finish upload can also leave
main updated locally, with your change branch still selected. Read the error,
repair network/access problems and review Finish again. Zero never force-pushes
or silently discards work. Separate changes on local main, unrelated histories
or unfinished Git operations need normal Git help before continuing.

After a successful real Finish, open GitHub and check the files and commit on main.
Click the connected repository name, choose **Copy repository link**, and paste
the link separately into the assignment
in **Pika**. Give your teacher access if the repository is private. Copying a URL
does not upload code, establish that the remote is current or submit in Pika.

## Before a class adopts it

Use the [classroom pilot checklist](CLASSROOM-PILOT.md) on a student machine.
A Mac teacher trial verified native sign-in and a private repository upload.
Physical Windows/Linux, school restrictions and novice trials remain unverified;
automated authentication and transport checks continue to use mocks.

For a contribution, propose one readable helper or example, explain how to try
it and include the checks you ran. ScoreDisplay's caption constructor is a shipped
example of a compatible contribution: its no-argument constructor keeps the quiz
working while the tracker displays “Completed”. The study app reuses that class
and adds ordinary Question objects; see its bundled guide. Review a shared change
with the teacher and verify both apps before a cohort adopts it. Ordinary Java
packages, interfaces and JavaFX properties are available as later steps.
