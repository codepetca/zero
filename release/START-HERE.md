# Start with Zero

This guide is prepared for the local, unreleased Zero **0.5.16** candidate
with core **0.1.3**, targeting **Mac with Apple Silicon** and **Windows**.
Use the guide bundled with an older download for its controls. Linux and Intel
Macs are unsupported; physical Windows/classroom testing remains pending.

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

You can use the manual steps below instead. Git and GitHub are needed for sharing
work, not for running the first app. Sign in only when you are ready to upload.

## Manual setup

1. Install a supported **JDK 17+** and **VS Code**. Your first build needs internet
   for the pinned browser compiler and dependencies, cached locally for reuse.
   Students do not need Node.js or global Maven.
2. Optionally import **optional/Zero.code-profile** through VS Code Profiles
   **before installing extensions**. In your chosen profile, use the Command
   Palette (**Ctrl+Shift+P** on Windows, **Command+Shift+P** on macOS):
   **Extensions: Install from VSIX…** → select **zero-0.5.16.vsix** beside this
   file; then **Extensions: Install Extensions** → install **Language Support
   for Java by Red Hat** (`redhat.java`) and **Debugger for Java**
   (`vscjava.vscode-java-debug`). These Java extensions provide editor errors
   and debugging support.
3. In VS Code, open the **starter** folder beside this file. Keep the whole folder
   together, including its hidden `.mvn` and `.vscode` folders.
4. Open **starter/lessons/00-hello-world.md** (Lesson 0: Hello, world!), then
   `src/main/java/Main.java`. Use **Zero: Run App** to see **Hello, world!**.
   Change the greeting to **Hello, Java!**, then click Run App again.
5. For the lessons, choose **Zero: Start project** and create **Greeting** once
   for lessons 0–2. Create **Study** at lesson 3 and **Game** at lesson 8.
   Keep the same project for each group's following lessons; click Run App again
   after editing. These empty practice projects stay local. Read
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

Running locally needs no GitHub account. GitHub actions are live by default;
nothing uploads automatically. Follow teacher visibility instructions, connect
your own repository, then review Upload and branch changes. Tutorial projects stay
local-only. Git **2.31+** and your own GitHub account are required for upload and publishing. Submit the repository link
separately in Pika.

## Publish a playable app

In your own project, Run App and test the version you want to publish. Finish and
upload it on **main**, then choose **Publish app** in Zero’s **GitHub** section.
Use the same GitHub account in Zero and any browser authorization. The first
publish reviews the public destination, asks for GitHub workflow permission when
needed, and uses the normal reviewed upload for its publishing files. The app and
included assets will be public; your source repository keeps its visibility.
The first publish confirms its destination. Later explicit Publish actions revalidate
and update that approved site without another destination dialog.

Zero publishes the locally checked build. Wait for **Your playable game is live**,
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
