# Start with Zero

This local Mac candidate **0.5.50** includes core **0.3.0**, targeting **Mac with Apple Silicon** and **Windows**.
Use the guide bundled with an older download for its controls. Linux and Intel
Macs are unsupported; physical Windows/classroom testing remains pending.

## Before lesson 0

Tutorials require **your own GitHub account and Git 2.31+**. Before starting:

1. Follow your teacher's username/email rules. Create your account at
   [github.com/signup](https://github.com/signup), verify its email, and keep
   your password private. Use your own account for the template repository,
   VS Code cloning and Zero uploads.
2. Check GitHub access, Zero browser sign-in and compiler downloads on your
   school machine/network. Use Setup help for missing Git; ask teacher/IT about
   restrictions rather than bypassing them.
3. Zero creates public tutorial repositories. Check your teacher's privacy rules
   before creating one; ask your teacher if private work is required. For a
   private repository, invite your teacher's confirmed GitHub username and verify
   access. A link alone does not grant access.
4. Configure a teacher-approved Git name/email in each cloned repository before
   uploading. For email privacy, copy your exact GitHub `noreply` address from
   Settings → Emails; do not put passwords or tokens in the project.

The ordinary Hello World setup check needs no account. After tutorial cloning
and compiler caching, Run App works offline. Uploading needs internet/sign-in.
Publishing a game is optional and public; private-repository Pages eligibility
depends on the GitHub plan. Do not change visibility or buy a plan just to finish
lessons. Read the [complete account/privacy setup](https://zero.codepet.ca/docs/setup#before-lesson-0-github-and-privacy).

## Open a tutorial project

Follow the sidebar: **Sign in to GitHub**, then
**Install Zero for GitHub** if requested, then **Start tutorial**. Sign-in opens GitHub in your browser and returns to Zero.
The main button says **Sign in to GitHub** while signed out, then **Start tutorial**
once signed in. If browser sign-in fails, check your connection/default browser
and try again; local running remains available. Zero checks project access read-only and stops
at the next sidebar step. If access is missing, **Install Zero for GitHub**
opens the pinned GitHub App page after a read-only recheck. Approve selected
repositories there, then return to Zero; it checks again automatically. Use
**Check again** as fallback. Escape or a failed check leaves the current step
visible for retry. A saved session is checked read-only on launch without
opening a browser. Local Run and Files remain usable signed out or offline;
cloud repository, push and sharing controls appear after access is ready.

When ready, **Start tutorial** is the primary empty-sidebar action. Choose
**Greeting app**, name the repository and choose where to save its clone.
**New project…** is the secondary action for skipping the tutorial and creating
original work. Zero creates the verified scaffold and opens your clone with
`Main.java` beside **Tutorials** for lesson 0. Older downloads keep their bundled
setup instructions.

Already cloned it? **Open local project** opens your existing Zero folder
without cloning. **Open Tutorials** resumes its saved lesson; lesson selection,
scroll position and disclosures persist locally per project. There is no completion
or grading tracking. Use **All tutorials** to choose the first lesson and restart
reading without changing your code. **Start tutorial** creates a separate new
repository, not a reset of existing work. With a local folder that has no origin,
use **Project → Connect to GitHub…** for your own existing repository URL.
Signed-out Git controls show only **Sign in to GitHub**; local Run and Files remain.
Connected projects keep their repository and branch controls, with **Publish app**
in the repository menu. Keep tutorial source visibility under your teacher's rules.

## Zero app for Mac

Open the downloaded DMG and drag **Zero.app** into **Applications**.
Open **Zero** from Applications. The first launch shows **Preparing Zero…**
with a progress bar below the text while it prepares Java, editor settings and extensions.
Zero then opens its configured VS Code editor with the setup sidebar. Follow
the tutorial flow above. Setup help → Test installation is an optional completed
Hello World check in a separate window marked Installation test; choose Run test
there to verify the native JavaFX window without a GitHub account.

After copying Zero into Applications, you can eject the DMG. Later, open **Zero**
again from Applications or the Dock to return to your saved Zero editor session.
A recognized existing Zero kit receives only setup-file updates; your code,
assets and saved projects are kept. Normal reopening checks readiness without
copying the kit again. If opening fails, **Try again** and **Details** provide help.

Windows native setup still guides any required tool or profile actions. The
ZIP/manual paths remain below; they do not use the Mac app's automatic preparation.

## Guided setup

Extract the **whole ZIP** first. On Windows, double-click `setup/Setup.cmd`.
On a supported Mac, double-click `setup/Setup.command`.

Setup checks your existing tools first. Choose an installation or help action
only for items that need attention. It can help install missing tools through an
existing system package manager, install the Zero/Java extensions, and open the
tutorial welcome. It does not install a package manager or silently replace working tools.
Your computer may ask for permission; if a school policy blocks setup, ask your
teacher or IT. Follow the setup prompts about choosing/importing a VS Code profile.

Inside VS Code, choose **Zero: Setup Help**, or **Setup help** in the sidebar.
The checklist explains what is ready, offers extension installation and official
Java/Git installer links, and has **Check again**, **Run current app**, and **Test installation** actions.
Run current app downloads Maven and JavaFX dependencies as needed. Test installation
opens the separate completed Hello World check; choose Run test and confirm
its JavaFX window. A passed tool check alone does not prove the app runs.

You can use the manual steps below instead. The ordinary first-app tool check
needs no GitHub account. Complete the account/privacy setup above before tutorial
lesson 0, then create and clone your own tutorial repository.

## Manual setup

1. Install a supported **JDK 17+** and **VS Code**. Your first build needs internet
   for Maven and JavaFX dependencies, cached locally for reuse.
   Students do not need Node.js or global Maven.
2. Optionally import **optional/Zero.code-profile** through VS Code Profiles
   **before installing extensions**. In your chosen profile, use the Command
   Palette (**Ctrl+Shift+P** on Windows, **Command+Shift+P** on macOS):
   **Extensions: Install from VSIX…** → select **zero-0.5.50.vsix** beside this
   file; then **Extensions: Install Extensions** → install **Language Support
   for Java by Red Hat** (`redhat.java`) and **Debugger for Java**
   (`vscjava.vscode-java-debug`). These Java extensions provide editor errors
   and debugging support.
3. Open Zero through the kit’s setup launcher and choose **Start tutorial**.
   Create and clone your Greeting repository using the flow above.
4. Follow lesson 0 beside Main. Use **Run App** to preview your own code.
   Keep each tutorial repository across its group’s lessons. Use Study’s template
   at lesson 3 and Game’s at lesson 8. Use New branch, edit/Run, Upload changes
   and Finish change as you progress.
5. The bundled `starter` is a completed setup check under **Setup help →
   Test installation**, separate from the tutorial. Its README and API remain
   optional framework reference.

The optional profile follows the system light/dark appearance and enables autosave.
The optional keybindings file contains F6/F7 shortcuts you can add yourself.

Tutorial projects open Main beside Tutorials. Other student projects can open
the first lesson once when their editor is empty; the installation test does not.
Use **Zero: Open First Lesson** in the Command Palette to reopen it. A failed
Zero run offers **Show Problems** to reach source errors. Run App saves and
compiles your Java locally, then opens a native JavaFX window. After editing,
Run App again stops the previous process, rebuilds and starts the app. **Stop**
ends the owned build or app process. If a download or build fails, read the task
terminal or Problems, repair the connection or indicated code, and Run App again.
A failed build does not start the previous build as a successful new run.

The terminal equivalent inside starter is **./mvnw clean compile javafx:run**
on Mac or **.\mvnw.cmd clean compile javafx:run** on Windows. Native Run does
not check browser compatibility. Publish app or advanced Export for web performs
the browser API checks and compilation before sharing a playable browser app.

After the initial tutorial clone, local Run needs no active GitHub sign-in.
GitHub actions are live by default;
nothing uploads automatically. Follow teacher visibility instructions, connect
your own repository, then review Upload and branch changes. Tutorial projects
require their own template-created repository and clone. Git **2.31+** and your own GitHub account are required for upload and publishing. Submit the repository link
separately in Pika.

## Publish a playable app

In your own project, Run App and test the version you want to publish. Finish and
upload it on **main**, then choose **Publish app** in Zero’s **repository menu**.
Use the same GitHub account in Zero and any browser authorization. The first
publish reviews the public destination, asks for GitHub workflow permission when
needed, and uses the normal reviewed upload for its publishing files. The app and
included assets will be public; your source repository keeps its visibility.
The first publish confirms its destination. Later explicit Publish actions revalidate
and update that approved site without another destination dialog.

Zero publishes the locally checked build. Wait for **App published**,
then choose **Open app** or **Copy playable link**. Later use **Zero: Open Published
App** or **Zero: Copy Playable Link** in the Command Palette. If publishing is still
running, choose Publish app again to recheck; an error keeps the old live page.
This game link is separate from **Copy repository link** for Pika.

**Share project** prepares a separate ZeroHub source submission. This candidate
can attach a verified playable link for that exact uploaded commit; ZeroHub’s
**Play latest** opens the student-hosted app, while its source download stays an
exact version. Checker acceptance and public activation are still pending;
public ZeroHub uploads are not open yet.

## Use a ZeroHub component

This kit includes automatic library setup. Choose **Browse ZeroHub → Libraries**
in the sidebar, pick a component, then choose
**Add library → Apply**.
Zero sets up the library for your app. Use the component's Java import and
example, then **Run App**. You do not need to edit the project setup file.

Choose **Update** when a newer compatible version is available; **Revert** returns
to your preceding version. Existing app code is kept. Browsing and using public
libraries needs no GitHub sign-in. Public library uploads are not open yet.

The starter also includes readable examples and editable ordinary Java
framework source.
