# Start with Zero

This kit contains Zero **0.5.15** for **Mac with Apple Silicon** and **Windows**.
Linux and Intel Macs are unsupported.

## Zero app for Mac

Open the downloaded DMG and drag **Zero.app** into **Applications**.
Open **Zero** from Applications. The first launch shows **Preparing Zero…**
with a progress bar below the text while it prepares Java, editor settings and extensions.
Zero then opens its configured VS Code editor automatically. Choose **Run App**
and confirm the greeting window. GitHub sign-in is needed only when sharing work.

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
Run first app downloads Maven/JavaFX as needed. Confirm the separate greeting
window opens; a passed tool check alone does not prove the app runs.

You can use the manual steps below instead. Git and GitHub are needed for sharing
work, not for running the first app. Sign in only when you are ready to upload.

## Manual setup

1. Install a supported **JDK 17+** and **VS Code**. Your first build needs internet
   for Maven and JavaFX downloads. Students do not need Node.js or global Maven.
2. Optionally import **optional/Zero.code-profile** through VS Code Profiles
   **before installing extensions**. In your chosen profile, use the Command
   Palette (**Ctrl+Shift+P** on Windows, **Command+Shift+P** on macOS):
   **Extensions: Install from VSIX…** → select **zero-0.5.15.vsix** beside this
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
Zero run offers **Show Problems** to reach source errors.

From a terminal inside starter, run **./mvnw clean compile javafx:run**.
On Windows use **.\mvnw.cmd clean compile javafx:run**.

Running locally needs no GitHub account. Upload, Start and Finish default to
simulation. Follow teacher visibility instructions before creating your own
repository or enabling live uploads. Submit the repository link separately in Pika.

## Use a ZeroHub component

This kit includes automatic library setup. In Zero's (…) menu, choose
**Libraries and Games → Browse libraries**, pick a component, then choose
**Add library → Apply**.
Zero sets up the library for your app. Use the component's Java import and
example, then **Run App**. You do not need to edit the project setup file.

Choose **Update** when a newer compatible version is available; **Revert** returns
to your preceding version. Existing app code is kept. Browsing and using public
libraries needs no GitHub sign-in. Public library uploads are not open yet.

The starter also includes readable examples and editable ordinary Java
framework source.
