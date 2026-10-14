# Getting started with Zero

Zero is a local Java kit: edit ordinary Java in VS Code, then open your app in a
separate JavaFX window. This MVP targets **Mac with Apple Silicon** and
**Windows**; Linux and Intel Macs are unsupported. On a supported Mac, use
**Zero Setup** for automatic setup. Windows is offered alongside Mac as the
published **complete kit ZIP** for manual setup; the Windows native EXE is not
published. The ZIP is also a manual alternative for a supported Mac;
it includes the starter, extension, profile and keyboard shortcuts. A separate
starter-only ZIP is available from [GitHub releases](https://github.com/codepetca/zero/releases).
See [verification evidence](VERIFICATION.md) for completed checks and platform limits.

## Zero Setup for Mac

The signed and notarized **Mac setup 0.5.12** prepares Zero with one small window,
one changing status message and a progress bar:

1. Open Zero Setup. It automatically prepares `~/Zero`. A recognized existing
   kit receives setup-file updates; your code, assets and saved projects are kept.
2. Wait while setup prepares Java and the editor. It reuses a compatible VS Code
   or downloads a verified copy, then installs Zero and Java support in a separate
   editor configuration. No profile import or Java configuration is needed.
3. Zero opens automatically when setup finishes. Review the starter before granting
   workspace trust if VS Code asks, then choose **Run App**. A separate window shows **Hello, world!**.
   The first build needs internet for Maven and JavaFX.

Later, open `~/Zero/Open Zero.command` to return to this configured editor.
GitHub sign-in can wait until you want to share your work. Git must be available
for repository work; use Setup help when you reach that step. You do not need
Python, Node.js, Homebrew or a separate Maven/JavaFX installation.
If setup fails, **Details** shows technical output and useful errors.
Clean-machine security prompts, physical Windows and novice classroom flows
remain unverified; see [setup behaviour and limits](SETUP.md).

If you chose the **complete kit ZIP**, follow the manual steps below. A
starter-only ZIP contains the project, but not the Zero extension or optional
profile; download the extension separately from [GitHub releases](https://github.com/codepetca/zero/releases) when needed.
For the optional profile, download the **complete kit ZIP**.

## One-time setup

These steps apply to the **complete kit ZIP** on Windows,
or to optional manual setup on a Mac with Apple Silicon. Native Mac setup uses
the automatic flow above.
The downloaded filename and release page identify the version.
If your extracted complete kit includes a `setup/` folder, you may instead open
`setup/Setup.cmd` on Windows or `setup/Setup.command` on a supported Mac.
Its checker reuses suitable installations, offers explicit
install/help actions and opens the starter. Keep the whole kit together.
No Node.js or separate Maven is needed.
Actual Windows installers, school policies and clean personal-machine installation
remain unverified; see [setup behaviour and limits](SETUP.md).

With the current extension, **Setup help** inside VS Code shows a native checklist
with **Check again**. Older extensions may show a simpler setup guide.
Java editor/debugger repair uses VS Code's extension installer in the current
profile. Java/Git repair opens an official download page and explains installation
and restarting VS Code. **Run first app** uses the usual save/build/launch flow;
confirm its JavaFX window, since tool detection is not a build test.

1. Install VS Code and a supported **JDK 17 or later**; install **Git 2.31 or newer** for repository
   work. JDK 17 was tested. Check `java -version`, `javac -version` and
   `git --version` in a new terminal, then restart VS Code. The Java extension's
   runtime does not replace your project's build JDK; follow its setup help if
   it needs a newer editor JDK. The normal platform-specific Java extension bundles
   its tooling runtime on the relevant Windows/macOS platforms. Dependency support
   for other platforms does not expand Zero's MVP support. Universal extension
   builds currently need a Java 25+ tooling JDK; see the
   [Java extension setup](https://github.com/redhat-developer/vscode-java#quick-start).
2. Optionally import **optional/Zero.code-profile first** through VS Code Profiles. It
   contains settings only, defaults to light and enables 500 ms autosave.
   In VS Code 1.141, open **Preferences: Open Profiles (UI)**, choose the menu
   beside **New Profile → Import Profile… → Select File…**, then **Create** and
   **Use this Profile for Current Window**. In the chosen profile, install the **Zero .vsix included with your downloaded kit** through
   **Extensions: Install from VSIX…** in the Command Palette, then use
   **Extensions: Install Extensions** to install **Language Support for Java
   by Red Hat** (`redhat.java`) and **Debugger for Java**
   (`vscjava.vscode-java-debug`). Use the versioned Zero VSIX included with your
   downloaded kit; native Mac setup installs its bundled extension automatically.
   If you downloaded only the starter,
   get the separately labelled Zero extension from [GitHub releases](https://github.com/codepetca/zero/releases).
   Zero is not published in the Marketplace.
3. Move or copy the kit's **starter folder** into your own location, outside any
   other Git repository. For the separate starter-only ZIP, extract its
   **zero-starter folder** instead. Open that folder, rather than a single
   Java file. Keep its hidden `.mvn` and `.vscode` folders. Trust it only after
   checking its source and build scripts.
4. Open the starter's `lessons/00-hello-world.md` for **Lesson 0: Hello, world!**.
   Choose **Zero: Show Sidebar** in the Command Palette, then **Run App**.
   The first build needs internet to download Maven and JavaFX. Students do not
   need Node.js, global Maven or a separate JavaFX installation. On a supported Mac,
   a ZIP that loses executable permissions may need `chmod +x mvnw` once.
   Record school proxy/firewall problems with your teacher; do not place
   credentials in the project to work around them.

## Edit and run

Open [the online lessons](https://zero.codepet.ca/tutorials/0). At lesson 0,
click **Start Greeting project**, unzip it and open its folder in VS Code.
The small scaffold starts with empty `setup()`; the first run is a blank window.
Write your label following the lesson, then click **Run App again** after edits.
Keep this folder for lessons 1 and 2 as you add a button and name field.

At lesson 3, start **Study** once. Continue the same quiz through lesson 7,
adding attempts, reset methods, Counter and Question objects. At lesson 8,
start **Game** once and extend it through lessons 9–12. Lesson 10 reopens Study
and Game to reuse your own ScoreDisplay. Lesson 12's only optional download is
an image and sound ZIP; your own assets or the drawing fallback also work.

The website ZIPs work with the published extension's **Run App**. Kits from **0.5.9** also provide **Zero: Start project** in the Command Palette
to create the same three scaffolds without a website ZIP. Older kits use the
website project downloads. Practice projects stay local. Create a separate original
project if you want a GitHub repository or ZeroHub contribution. Read
[the lesson guide](../student-template/lessons/README.md) for the three groups.

The starter's example shelf remains optional reference. Try each independent
example in its own local copy, following its exact file list; it is separate
from the continuing lesson flow.

With the profile, autosave runs after 500 ms. **Run App** also saves files, cleans
and compiles the project, and restarts the app. Use **Ctrl+Shift+B** on Windows
or **Cmd+Shift+B** on macOS for the same default build task. There is no hot reload.
**Stop** ends the owned run; the app lives in its own native window.

Read compiler errors in the task terminal and Problems panel; use
**View: Toggle Problems** in the Command Palette and open the indicated source
line. See **Setup help** for missing local tools. F6/F7 are optional:
merge `optional/optional-keybindings.json` into your keyboard shortcuts if wanted.

To change appearance, run **Preferences: Color Theme** in the Command Palette.
The sidebar supports dark themes too. To return to an imported profile, run
**Profiles: Switch Profile → Zero**, then **Zero: Show Sidebar**.

## Your GitHub repository

Local running needs no GitHub sign-in. For sharing work, follow your teacher's
privacy, visibility and account instructions. If you used a ZeroHub GitHub template,
create your own repository from it and clone **your repository** as described in
[the course project guide](COURSE-PROJECT.md#create-your-own-repository-and-clone-it).
That clone already has Git history and its own origin: keep that repository,
complete sign-in and identity setup below, and skip creating an empty repository.
The empty-repository steps below apply to an extracted source ZIP:

1. Click **Sign in** beside **GitHub** in Zero and complete VS Code's native
   browser authentication flow. The control shows your GitHub username after
   sign-in; click it for **Change GitHub account…** or **Sign out…**. Sign out
   opens VS Code Accounts, where you choose your account and Sign Out. Canceling
   authentication leaves local Run available.
2. Choose **Connect a repository → Create a repository…**. This opens GitHub's new-repository
   page. Create your **own empty repository**, leaving README, license and
   gitignore uninitialized to avoid a separate starting history. This workflow
   does not use GitHub Classroom.
3. Return to **Connect a repository → Connect an existing repository…** and paste its
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

1. Click **New branch** beside `main`. Give it a short name such as `quiz-feedback`
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
Physical Windows, school restrictions and novice trials remain unverified;
automated authentication and transport checks continue to use mocks.

For a contribution, propose one readable helper or example, explain how to try
it and include the checks you ran. ScoreDisplay's caption constructor is a shipped
example of a compatible contribution: its no-argument constructor keeps the quiz
working while the tracker displays “Completed”. The study app reuses that class
and adds ordinary Question objects; see its bundled guide. Review a shared change
with the teacher and verify both apps before a cohort adopts it. Ordinary Java
packages, interfaces and JavaFX properties are available as later steps.
