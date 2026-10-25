# Getting started with Zero

This guide describes Mac setup 0.5.47, including guided GitHub sign-in and
project access before tutorial choices or repository details. The shared GitHub
App is registered as Codepet Zero under `codepetca`, with public IDs pinned in
source. Windows keeps the unsigned 0.5.21 preview and its matching manual ZIP.
Each published download retains its bundled behavior.

Local Mac candidate **0.5.49** includes Zero core **0.3.0**, the Zero-first
Greeting/Study/Coin tutorials and browser GitHub sign-in with an explicit code
fallback. It is not published; the public Mac download remains0.5.47. Editor
updates preserve existing projects’ framework source and build versions.

Mac 0.5.47 uses native JavaFX for Run App. To publish, stop the app, open the
arrow beside **Run**, then choose **Publish app**. GitHub setup and a connected
repository are required for publishing. Earlier downloads retain their
bundled Run behavior. Publish app or advanced Export for web performs browser
compatibility checks and compilation.

Zero is a local Java kit: edit ordinary Java in VS Code, then Run App to check and
compile locally and open its own native JavaFX window. This MVP targets **Mac with Apple
Silicon** and **Windows**; Linux and Intel Macs are unsupported. On a supported Mac, use
**Zero** for automatic setup. Windows now has an **unsigned installer preview**
for x64 Windows 10 (build 19041) or later. Run the Setup EXE; Zero prepares Java
and its configured editor on first launch, then opens the editor. Internet is
required for initial setup. Later, open Zero from the Start menu.
Windows may show an unknown-publisher or SmartScreen warning because this
preview is unsigned. Follow your school or device policies; ask your teacher or
IT if installation is blocked. Automatic Zero updates are off, and interactive
Windows installation testing is still pending. Download a newer installer
manually when needed.
Choose **Manual setup (ZIP)** beside the Windows installer on the download page
for the matching 0.5.21 complete kit. You can skip its setup scripts and follow
**One-time setup** below using existing tools or help from IT. The ZIP also
supports manual setup on a supported Mac;
it includes the starter, extension, profile and keyboard shortcuts. A separate
starter-only ZIP is available from [GitHub releases](https://github.com/codepetca/zero/releases).
See [verification evidence](VERIFICATION.md) for completed checks and platform limits.

The Project dropdown offers New, Clone, and Open. The Tutorials link opens the
reader without creating a project or signing in. Start tutorial begins the guided
project setup.

Opening a project keeps the Zero Start Page tab available in the same window.
Return to that tab to choose another project or tutorial.

Files now use native Explorer. The Zero controls and teaching New menu live in
that sidebar. If Zero appears below the files, drag its heading above them once;
VS Code remembers the order. Use New to create a Java class or import an asset.
Selecting files, editor tracking, rename, delete and drag-and-drop use Explorer.

**Start Page → Project → Clone** opens a searchable picker: recent projects on this Mac
first, then your accessible Zero repositories. Choose a recent project to reopen
its existing folder, or choose **Paste a GitHub URL…**.

**Updating Zero:** choose **Zero: Check for Updates**, then **Install and Relaunch**.
Zero reopens and loads the updated extension when its editor work is idle. The
first upgrade from 0.5.33 or earlier needs one manual Zero reopen/editor reload;
later updates use the corrected handoff.

## Start here

The Zero Start Page contains tutorial/project choices and recent projects.
Open **Zero: Start Page** from the Command Palette or **⋯ → Start Page** to
return to it. The sidebar stays focused on Run, Files and project development.


1. Download and launch **Zero**. The website needs no sign-in. Mac 0.5.47
   opens the Zero Start Page with the next setup action.
2. Choose **Sign in to GitHub** and complete the existing
   device flow if needed. Zero checks project access read-only and stops at the
   next Start Page step. If asked, choose **Install Zero for GitHub**; Zero opens
   the pinned GitHub App page after checking again. Approve selected repositories
   on GitHub, then return to Zero. The automatic recheck unlocks the next step;
   **Check again** is available as a fallback. Escape or a failed check leaves
   the current step visible for retry. A saved session is checked read-only on
   launch without opening a browser. Local Run and Files work signed out or
   offline; cloud repository, push and sharing controls stay hidden until ready.
   See [the setup guide](SETUP.md#start-a-tutorial-or-project) for details.
3. On the **Zero Start Page**, **Start tutorial** is primary. Choose **Greeting app**,
   enter a repository name, and choose its clone location. **Start Page → Project → New** is
   the action for skipping the tutorial and making original work.
4. In **Clone location**, keep the default `~/Zero Projects`
   or choose another folder outside any Git repository, then choose **Clone here**.
   Zero creates your repository from the verified template, checks App access,
   clones it and opens the project in the current VS Code window. No repository is created
   until you have chosen its name and location.
5. Follow the **Tutorials** tab beside `Main.java`, write the ordinary Java from
   lesson 0 and choose **Run App** to open your native JavaFX window. The Tutorials
   tab’s **Open in browser** opens the lesson in your default browser. Keep this repository for the following Greeting lessons.

Already cloned your project? Choose **Start Page → Project → Open** to open it without cloning again. Choose the **Tutorials** link to open the reader;
lesson selection, scroll position and disclosure state are saved locally per
project. This does not track completion or grading. Use **All tutorials** to
choose the first lesson and restart the reading sequence; your code stays as it
is. **Start tutorial** makes a new repository, not a reset of your existing one.
While signed out, local Run and Files stay available. Cloud repository, push and
sharing controls appear after access is ready. An
original local project without an origin offers **⋯ → Repository Actions → Create a repository…** to
create and connect an empty remote, or **⋯ → Repository Actions → Connect to GitHub…** for an existing URL. Connected
projects show owner/repository and retain branch actions; **Publish app** is available from the arrow beside **Run**.

Zero needs no separate account. Cancelling setup leaves the current Start Page
step available to retry; an existing local project's Run remains available. **⋯ → Troubleshooting → Test
installation** opens the bundled Hello World separately as **Installation test**. To return
to setup, use **Zero: Start Page** from VS Code's Command Palette.
For an existing remote, **Start Page → Project → Clone** accepts its HTTPS URL
and uses the same location picker; add that repository to the App's selection
when needed. **Start Page → Project → New** creates original work from Zero's starter.
If creation or cloning is interrupted, choose **⋯ → Repository Actions → Resume created project…**
when offered, review its saved link and check any preserved project folder before
trying again. Zero does not blindly repeat an
uncertain creation request or remove the repository.

Older published kits may use the VS Code 1.95 fallback for native Git cloning;
follow that release's bundled open-in-new-window instructions. Current source
uses Zero's guarded authenticated clone service.

## Before lesson 0: GitHub and privacy

Tutorials require **your own GitHub account and Git 2.31+ before lesson 0**.
This baseline supports the real push workflow used in the lessons.
The kit's ordinary Hello World setup check can run without an account; the
continuing tutorials start from your own template-created repository and clone.

1. Ask your teacher which username and email to use, and confirm that public
   tutorial source is allowed. For existing or GitHub-created repositories,
   follow your teacher's visibility instructions. Also
   confirm that GitHub device sign-in is allowed on your school device/network.
   If access is blocked, ask your teacher or IT; do not bypass school restrictions.
2. [Create a personal GitHub account](https://github.com/signup) if you do not
   already have one, and verify its email; [GitHub's account guide](https://docs.github.com/en/account-and-profile/how-tos/account-management/creating-an-account-on-github) explains this step. Use an email you can access under the
   school's instructions. Keep the account yours; never share its password or
   put passwords, tokens or recovery codes in project files.
3. Have **Git 2.31+** available locally; **Troubleshooting** explains missing tools.
   On the school machine, check that you can open GitHub, complete Zero's device
   sign-in and download Zero's compiler dependencies. Use the same account for
   your repository, cloning and Zero pushes. Nothing pushes just by signing in.
4. Repositories created through Zero are public. Keep passwords, personal data
   and other private files out of your project. If you create a private repository
   separately on GitHub, invite your teacher's confirmed GitHub username as a
   [collaborator](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository) through repository
   Settings → Collaborators → Add people. The teacher must accept; check they can
   open it. Collaborator access to a personal repository includes writing code.
   A private repository link alone does not grant access.

Before your first push, set the per-repository Git name/email following the
instructions below. A Git commit records that identity. For email privacy, enable
**Keep my email addresses private** in GitHub Settings → Emails and copy the exact
GitHub-provided `noreply` address into your repository's `user.email`; do not guess
its spelling. This setting does not rewrite old commits. See
[GitHub's commit email guide](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).

**Publishing a playable game is optional.** Its app and included assets become
public; existing or GitHub-created source can stay private. GitHub Free supports private repositories
and collaborators, but Pages from a private repository needs an eligible plan.
Keep existing repository visibility; if Pages is unavailable, skip Publish or
ask your teacher about an approved option. No paid plan is needed to complete
the tutorial repository/push workflow. See [GitHub's Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).
After cloning and caching compiler dependencies, editing and Run App work offline
without an active GitHub session; pushes still need sign-in and internet.

## Zero app for Mac

Mac setup 0.5.47 uses the familiar drag-to-Applications flow. Current source guides
GitHub setup on the Zero Start Page. Older published downloads keep their original setup apps and bytes.

1. Open the downloaded DMG and drag **Zero.app** into **Applications**.
2. Open **Zero** from Applications. On first launch, wait while **Preparing Zero…**
   and its progress bar prepare Java and the editor. A recognized existing kit
   receives setup-file updates; your code, assets and saved projects are kept.
3. Zero opens its configured VS Code editor and sidebar. Choose **Sign in to
   GitHub**, then **Install Zero for GitHub** if requested. Once ready, choose
   **Start tutorial** and create your **Greeting app** repository. Zero opens
   your clone with `Main.java` beside **Tutorials**. Review your project
   before granting workspace trust if VS Code asks, then follow lesson 0.
   The first build needs internet for compiler dependencies, cached for reuse.

You can eject the DMG after copying Zero. Later, open **Zero** from Applications
or the Dock to return to the saved Zero editor session. Reopening checks readiness
without repeating preparation when the current installation is ready.

Complete the GitHub account/privacy steps above before starting tutorial lesson 0.
The optional **⋯ → Troubleshooting → Test installation** opens the bundled completed
Hello World project in a separate window marked **Installation test**. It does
not require GitHub and is separate from your tutorial; tutorial creation,
cloning and pushes do. Use **⋯ → Troubleshooting** for missing Git. You do not need
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
install/help actions and opens Zero’s tutorial welcome. Keep the whole kit together.
No Node.js or separate Maven is needed.
Actual Windows installers, school policies and clean personal-machine installation
remain unverified; see [setup behaviour and limits](SETUP.md).

With the current extension, **⋯ → Troubleshooting** inside VS Code shows a native checklist
with **Check again**. Older extensions may show a simpler setup guide.
Java editor/debugger repair uses VS Code's extension installer in the current
profile. Java/Git repair opens an official download page and explains installation
and restarting VS Code. **Run current app** uses the usual save/build/launch flow.
For an optional setup check, choose **Test installation**, then **Run test**;
confirm its native JavaFX window, since tool detection is not a build test.

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
   contains settings only, follows the system light/dark appearance and enables 500 ms autosave.
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
3. Open Zero using its setup launcher, then choose **Start tutorial**. Connect
   GitHub when asked, choose **Greeting app**, and name and save your repository.
   Zero opens your clone with `Main.java` and **Tutorials** ready for lesson 0.
   Review its source and build scripts before granting workspace trust.
4. Follow lesson 0 in your project. The first build needs internet to download
   compiler dependencies into Zero’s local cache. Record school proxy/firewall
   problems with your teacher; do not place credentials in the project.

The bundled `starter` is a completed installation check, available through
**⋯ → Troubleshooting → Test installation**. It is separate from your tutorial repository.
Older starter-only downloads retain their bundled instructions.

## Editor appearance

New Zero editor settings follow the system light/dark appearance. Updates preserve
existing settings. In an existing Zero window, enable **Window: Auto Detect Color
Scheme** in Settings to follow the system. Use **Workbench: Preferred Light Color
Theme** and **Workbench: Preferred Dark Color Theme** to choose the matching themes.
Disable automatic detection to keep a fixed theme.

## Edit and run

Open [the online lessons](https://zero.codepet.ca/tutorials/0). At lesson 0,
choose **Start tutorial → Greeting app** in Zero to create and clone a repository
in your own GitHub account after selecting its name and location. It is public.
Use **your repository**, not Zero's shared template. The template has empty `setup()`; its first native JavaFX window is
blank. Write your label following the lesson and Run App again after edits.
Keep that repository for lessons 1 and 2 as you add a button and name field.
GitHub/Git setup is part of the tutorial; see [tutorial repository setup](COURSE-PROJECT.md#tutorial-repositories).
After cloning, local Run needs no current GitHub sign-in or network connection
once compiler dependencies are cached.

At lesson 3, start **Study** once. Continue the same quiz through lesson 7,
adding attempts, reset methods, Counter and Question objects. At lesson 8,
start **Game** once and extend it through lessons 9–12. Lesson 10 reopens Study
and Game to reuse your own ScoreDisplay. Lesson 12's only optional download is
an image and sound ZIP; your own assets or the drawing fallback also work.

In Mac 0.5.47, **Start tutorial** on the **Zero Start Page**
checks project access before using the matching verified template to
create your repository and clone it; it does not create a local-only practice folder. Templates
follow verified publication metadata. An unavailable template shows a
specific message rather than a guessed download.
Older published kits keep their bundled local-practice behavior. New tutorials
have no project-ZIP alternative. Read [the lesson guide](../student-template/lessons/README.md)
for the three groups. Original ZeroHub contributions remain separate from tutorial exercises.

The starter's example shelf remains optional reference. Try each independent
example in its own local copy, following its exact file list; it is separate
from the continuing lesson flow.

With the profile, autosave runs after 500 ms. **Run App** also saves files and
uses the project’s Maven wrapper to compile and open a native JavaFX window. After editing, Run App again rebuilds and restarts it. Use
**Ctrl+Shift+B** on Windows or **Cmd+Shift+B** on macOS for the same run action.
**Stop** cancels the owned build or app process. Closing the app window returns
Run to idle.

First-time compiler downloads can take longer; later projects reuse the cache.
If a download fails, repair the connection and Run App again. Local Run does
not check the supported browser subset. Publish app and advanced Export for web
perform browser compatibility checks and production compilation; native success
does not establish browser compatibility.
A failed build does not open an older build as a successful new run.

Read compiler errors in the task terminal and Problems panel; use
**View: Toggle Problems** in the Command Palette and open the indicated source
line. See **⋯ → Troubleshooting** for missing local tools. F6/F7 are optional:
merge `optional/optional-keybindings.json` into your keyboard shortcuts if wanted.

To change appearance, run **Preferences: Color Theme** in the Command Palette.
The sidebar supports dark themes too. To return to an imported profile, run
**Profiles: Switch Profile → Zero**, then **Zero: Show Sidebar**.

The terminal equivalent of Run App is `./mvnw clean compile javafx:run`
on Mac or `.\mvnw.cmd clean compile javafx:run` on Windows. Native success does
not verify browser compatibility.

## Your GitHub repository

Local running needs no GitHub sign-in. Live push and publishing need Git
**2.31+** and your own GitHub account. For sharing work, follow your teacher's
privacy and account instructions. Repositories created through Zero are public;
existing/cloned repositories keep their visibility. If you used **Start tutorial** or
**Start Page → Project → New**, Zero already created and cloned **your repository**.
That clone already has Git history and its own origin: keep that repository,
complete sign-in and identity setup below, and skip creating an empty repository.
The empty-repository steps below apply to an extracted source ZIP:

1. Choose **Sign in to GitHub** on the **Zero Start Page** and complete the
   device-code flow with your personal account. Use **⋯ → GitHub Account**
   for **Change GitHub account…** or **Sign out**. Sign out clears only Zero's
   connection on this computer and preserves local work and other extensions'
   accounts. Canceling authentication leaves local Run available.
2. With your original local project open, choose **⋯ → Repository Actions → Create a repository…**.
   Enter a name. Zero creates an empty public remote
   in your personal account, verifies App access and connects this project.
   No source is uploaded by creation. This workflow does not use GitHub Classroom.
3. If you already created an empty repository on GitHub, use **⋯ → Repository Actions → Connect to GitHub…**
   and paste its HTTPS URL instead. Zero initializes Git in this
   standalone folder if needed and adds its origin; it asks before replacing an
   existing origin. This local connection does not prove remote ownership,
   existence or access. Before remote work, Zero checks your personal ownership,
   App permissions and explicit installation membership.
4. Set your Git commit identity if needed, using your teacher-approved display
   name and commit email (the exact GitHub `noreply` address for email privacy). These commands configure this repository
   only, from the student folder:

   ```sh
   git config user.name "Your Name"
   git config user.email "your-email@example.com"
   ```

Signing in does not set Git's commit identity. Zero's `zero-github` provider
stores expiring user/refresh tokens in VS Code SecretStorage. Its clone, push
and publish commands use transient credentials and check the captured account
and access again. General Source Control and terminal network commands do not
automatically share this connection; they use their normal Git authentication.
Never put passwords or tokens in project files. If an account/session changes
during review, sign in as needed and review the push again.

ZeroHub's optional browser connection uses the same Codepet App and numeric
GitHub identity with a separate credential family. Its ordinary user token can
carry the App's installed repository permissions as well as starring; it is not
a star-only credential. Browser sessions require reconnection after eight hours.
Desktop sign-in does not pair the browser or transfer credentials to it.

## Your individual workflow

`main` holds completed work. A change branch holds your next improvement.
**GitHub actions are live by default.** Nothing pushes automatically: choose an
action. Check your code before choosing an action; the **Commit Message** input shows
only the native Enter/Escape hint. Repository and branch stay visible in the sidebar. Entering a branch name or commit message proceeds
directly, and Merge to main starts when you click it. Local Run needs no active
GitHub session. Tutorial projects require their initial own-repository clone.

For a new repository, **Commit & push once on main** to save and push the
starter. Check your changes, the repository and branch in the sidebar,
then enter a short commit message and press Enter. This is the starting version.

For each improvement:

1. Click **New branch** in the repository menu. Give it a short name such as `quiz-feedback`
   using lowercase letters, numbers and dashes. Press Enter to create it.
   Commit & push pending edits first. Zero updates main from GitHub when it can do so
   without combining separate histories, then creates the branch.
2. Edit and **Run App**. Check your change.
3. **Commit & push** creates a commit when needed and pushes the current branch.
   Check the repository and branch in the sidebar, describe what changed, then
   press Enter. You can repeat this while building; it does not yet add the change to main.
4. Click **Merge to main** beside the branch name. Commit & push any pending edits first.
   Run and check your app before clicking. **Merge to main** merges the current
   branch into main and pushes main. If GitHub
   has newer main changes, Zero incorporates them into your change branch and
   pauses. Run and check the combined app, then choose Merge to main again to
   merge and push it to main.
5. After confirmed success, Zero returns to main and safely removes the unchanged
   finished local branch. Its GitHub branch remains available. If cleanup cannot
   be completed safely, Zero keeps the local branch and tells you to check Output.

If an update creates conflicts, Zero keeps your work and opens VS Code's Source
Control. Open the conflicted files or Merge Editor, inspect both changes and
choose/edit the combined result. Save, stage the resolved files and commit the
merge through Source Control. Run the app, then choose **Merge to main** again
for a fresh review. Ask your teacher if the correct result is unclear.

A failed push can leave a local commit. A failed main push can also leave
main updated locally, with your change branch still selected. Read the error,
repair network/access problems and review Merge to main again. Zero never force-pushes
or silently discards work. Separate changes on local main, unrelated histories
or unfinished Git operations need normal Git help before continuing.

After a successful Merge to main, open GitHub and check the files and commit on main.
Click the connected repository name, choose **Copy repository link**, and paste
the link separately into the assignment
in **Pika**. Give your teacher access if the repository is private. Copying a URL
does not push code, establish that the remote is current or submit in Pika.

## Publish your playable app

In your own project, **Run App** and test the version you want other people to
play. Stop the app and choose **Publish app** from the arrow beside Run. Publish
saves open files, asks for a commit message when needed, then commits and pushes
your changes before deploying. Already committed work needs no new message; an
already uploaded main skips the upload. If you are on a change branch, finish it
with **Merge to main** first. Cancelling or failing the upload stops deployment.
Sign in and connect your own repository to enable publishing.

The first publish reviews the public destination and prepares publishing files.
Keep the repository selected for Zero's App and review any missing Contents,
Workflows, Actions, Pages or first-time setup permission on GitHub. Publish sets
up the app page automatically once Zero's updated permission is approved. It also
updates recognized untouched older Zero helpers before the normal commit review
and recovers locks from confirmed stopped builds. Your own helper edits are kept.
Enter a commit message if the source/setup files need committing; Zero then continues
publishing without another publication confirmation. Zero uses the locally checked build; GitHub deploys it to
Pages. The playable app and its included assets are public, even if your source
repository is private and your GitHub plan supports Pages. Zero keeps the
repository’s visibility unchanged.

Wait for **App published**, then choose **Open app** or **Copy
playable link**. You can retrieve the checked link later with **Zero: Open
Published App** or **Zero: Copy Playable Link** in the Command Palette. Later
publishes revalidate and update the same approved destination without another
destination dialog. If a run is still pending, choose Publish
app again to recheck it. Follow any specific GitHub action or permission error;
an unsuccessful update keeps the previous live page.

The playable link lets people use your app. **Copy repository link** identifies
your source for the separate Pika submission. **Share project** prepares a
separate ZeroHub source contribution. It includes a saved
playable link only when Zero can verify it for that exact pushed commit.
ZeroHub's screenshot or Play tile opens the student-hosted app, which can change
with later publishes. Its version link opens the GitHub repository. Public
managed library admission remains gated; local Check is not public acceptance.
Repository pushes, publishing an app and submitting a ZeroHub contribution are
separate explicit actions.

## Before a class adopts it

Use the [classroom pilot checklist](CLASSROOM-PILOT.md) on a student machine.
The earlier native-provider trial and later development-host GitHub App/device
sign-in, selected private clone and guarded push are separate evidence. A released
installer and registered App IDs do not establish every live flow. Empty-account
onboarding, automatic access to App-created repositories, renewal/revocation,
account switching, browser identity and first/repeat Pages publication still
need observed acceptance. Follow [the recorded limits](VERIFICATION.md).
Physical Windows, school restrictions and novice trials remain unverified;
automated authentication and transport checks continue to use mocks.

For a contribution, propose one readable helper or example, explain how to try
it and include the checks you ran. ScoreDisplay's caption constructor is a shipped
example of a compatible contribution: its no-argument constructor keeps the quiz
working while the tracker displays “Completed”. The study app reuses that class
and adds ordinary Question objects; see its bundled guide. Review a shared change
with the teacher and verify both apps before a cohort adopts it. Ordinary Java
packages, interfaces and JavaFX properties are available as later steps.
