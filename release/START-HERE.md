# Start with Zero

This guide is prepared for the local, unreleased Zero **0.5.22** candidate
with core **0.2.1**, targeting **Mac with Apple Silicon** and **Windows**.
Use the guide bundled with an older download for its controls. Linux and Intel
Macs are unsupported; physical Windows/classroom testing remains pending.

## Before lesson 0

Tutorials require **your own GitHub account and Git 2.31+**. Before starting:

1. Follow your teacher's username/email rules. Create your account at
   [github.com/signup](https://github.com/signup), verify its email, and keep
   your password private. Use your own account for the template repository,
   VS Code cloning and Zero uploads.
2. Check GitHub access, native VS Code sign-in and compiler downloads on your
   school machine/network. Use Setup help for missing Git; ask teacher/IT about
   restrictions rather than bypassing them.
3. Choose **Private** for tutorial repositories unless teacher/school policy says
   otherwise. Invite your teacher's confirmed GitHub username as a collaborator
   on each repository and verify they accepted and can open it. A link alone
   does not grant private access; collaborators can also edit code.
4. Configure a teacher-approved Git name/email in each cloned repository before
   uploading. For email privacy, copy your exact GitHub `noreply` address from
   Settings → Emails; do not put passwords or tokens in the project.

The ordinary Hello World setup check needs no account. After tutorial cloning
and compiler caching, Run App works offline. Uploading needs internet/sign-in.
Publishing a game is optional and public; private-repository Pages eligibility
depends on the GitHub plan. Do not change visibility or buy a plan just to finish
lessons. Read the [complete account/privacy setup](https://zero.codepet.ca/docs/setup#before-lesson-0-github-and-privacy).

## Open a tutorial project

Choose **Sign in** in Zero. Use **Start tutorial** in welcome or the **…** menu
to open the matching template, then create your own repository on GitHub and
copy its **Code → HTTPS** URL. Choose **Project → Clone from GitHub…** and paste
your URL in **Clone from GitHub**. In **Clone location**, keep `~/Zero Projects`
or choose another folder outside any Git repository, then choose **Clone here**.
Newer VS Code versions open the clone in a new window automatically; the
VS Code 1.95 fallback may ask you to choose **Open in New Window**.

Already cloned it? **Project → Open local project…** opens your existing Zero
folder in a new window without cloning. With a local folder that has no origin,
use **Project → Connect to GitHub…** for your own existing repository URL.
Signed-out Git controls show only **Sign in**; local Run and Files remain.
Connected projects keep their repository and branch controls, with **Publish app**
in the repository menu. Keep tutorial source visibility under your teacher's rules.

## Zero app for Mac

Open the downloaded DMG and drag **Zero.app** into **Applications**.
Open **Zero** from Applications. The first launch shows **Preparing Zero…**
with a progress bar below the text while it prepares Java, editor settings and extensions.
Zero then opens its configured VS Code editor automatically. Choose **Run App**
and confirm the greeting in Zero’s browser preview. GitHub sign-in is needed
only for repository and sharing actions.

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
starter. It does not install a package manager or silently replace working tools.
Your computer may ask for permission; if a school policy blocks setup, ask your
teacher or IT. Follow the setup prompts about choosing/importing a VS Code profile.

Inside VS Code, choose **Zero: Setup Help**, or **Setup help** in the sidebar.
The checklist explains what is ready, offers extension installation and official
Java/Git installer links, and has **Check again** and **Run first app** actions.
Run first app downloads the pinned browser compiler and dependencies as needed.
Confirm the greeting in the browser preview; a passed tool check alone does not
prove the app runs.

You can use the manual steps below instead. The ordinary first-app tool check
needs no GitHub account. Complete the account/privacy setup above before tutorial
lesson 0, then create and clone your own tutorial repository.

## Manual setup

1. Install a supported **JDK 17+** and **VS Code**. Your first build needs internet
   for the pinned browser compiler and dependencies, cached locally for reuse.
   Students do not need Node.js or global Maven.
2. Optionally import **optional/Zero.code-profile** through VS Code Profiles
   **before installing extensions**. In your chosen profile, use the Command
   Palette (**Ctrl+Shift+P** on Windows, **Command+Shift+P** on macOS):
   **Extensions: Install from VSIX…** → select **zero-0.5.22.vsix** beside this
   file; then **Extensions: Install Extensions** → install **Language Support
   for Java by Red Hat** (`redhat.java`) and **Debugger for Java**
   (`vscjava.vscode-java-debug`). These Java extensions provide editor errors
   and debugging support.
3. In VS Code, open the **starter** folder beside this file. Keep the whole folder
   together, including its hidden `.mvn` and `.vscode` folders.
4. Open **starter/lessons/00-hello-world.md** (Lesson 0: Hello, world!), then
   `src/main/java/Main.java`. Use **Zero: Run App** to see **Hello, world!**.
   Change the greeting to **Hello, Java!**, then click Run App again.
5. For the lessons, choose **Zero: Start project** to open Greeting's template.
   Create your own GitHub repository from it, then clone your repository and open
   its root folder in Zero. Use Study's template at lesson3 and Game's at lesson8.
   Keep each repository across its group's lessons. Use New branch, edit/Run,
   Upload changes and Finish change as you progress. These empty tutorial templates
   need verified publication before this candidate is released. Read
   **starter/lessons/README.md** or the online Tutorials for the next steps.
   **starter/README.md** covers running, examples and GitHub;
   **starter/API.md** describes the readable framework in your project.

The optional profile uses a light theme and autosave. The optional keybindings
file contains F6/F7 shortcuts you can add yourself.

Zero opens the first lesson's preview once per project when the editor is empty.
Use **Zero: Open First Lesson** in the Command Palette to reopen it. A failed
Zero run offers **Show Problems** to reach source errors. Run App saves, checks
and compiles your Java locally; after editing, Run App again rebuilds and restarts
the preview. **Stop** ends the preview and its audio. If a download or build
fails, read the error, repair the connection or indicated code, and Run App again.
Run App reports APIs outside the supported browser subset in Problems. A failed
build does not start the previous build as a successful new run.

For a native JavaFX diagnostic only, choose **Zero: Run Native App (Diagnostic)**.
Its terminal equivalent inside starter is **./mvnw clean compile javafx:run**
on Mac or **.\mvnw.cmd clean compile javafx:run** on Windows. This does not
check whether your app can run in the browser.

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
