# Guided student setup

Current source keeps Zero's verified Java21 separate from system Java. Open the
Zero app to use its configured editor. Run and browser builds select that private
JDK explicitly; the Zero Java terminal skips startup scripts that could replace
it. Repairing Zero updates only Java-owned settings in its isolated editor.
Your ordinary VS Code profiles, shell files and global Java settings are kept.
If private Java is unavailable, reopen Zero to repair it. This change does not
add another JDK download or change the Java17 source compatibility target; it
needs a new installer release before existing downloads acquire the behavior.

Mac 0.5.43 corrects text prompts: **Commit Message** appears above an empty field,
with `<Enter> to confirm · <Esc> to cancel` below it.

The signed, notarized Mac 0.5.43 app prepares Java and the editor, then guides
GitHub sign-in and project access before the tutorial choices. The current MVP
targets **Mac with Apple Silicon** and **Windows**. Linux and Intel Macs are
unsupported. Windows keeps the unsigned 0.5.54 installer preview and its matching
manual ZIP; automatic Windows updates and physical acceptance remain pending.
The general manual kit fallback remains 0.5.17. Each download retains its bundled
instructions. See [Windows installation and updates](WINDOWS-INSTALLER.md).

Mac 0.5.43 uses native JavaFX for Run App. To publish, stop the app, open the
arrow beside **Run**, then choose **Publish app**. GitHub setup and a connected
repository are required for publishing. Earlier downloads retain their
bundled Run behavior. Publish app or advanced Export for web performs browser
compatibility checks and compilation.

The Codepet Zero GitHub App is registered under `codepetca`, with public IDs
pinned in source. Students approve access on GitHub. See
[the identity plan](ZERO-IDENTITY-PLAN.md) for account and permission details.

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

## Before tutorial lesson 0

Complete [GitHub account and privacy setup](GETTING-STARTED.md#before-lesson-0-github-and-privacy)
before the first tutorial: student-owned verified account, Git 2.31+, school
GitHub device sign-in and compiler-download access, awareness that repositories
created through Zero are public, and teacher access where needed. Keep secrets and
private files out of those repositories. Existing or GitHub-created private repositories
may use teacher collaborator access. Configure teacher-approved per-repository commit identity;
copy the exact GitHub `noreply` email when using email privacy. Publishing remains
optional and public, and private-repository Pages eligibility depends on the plan.
No paid plan is required for tutorial work.

The local starter smoke check can run before account setup. After cloning a
tutorial repository and caching compiler dependencies, Run works offline without
an active GitHub session; repository uploads require internet/sign-in. These are
student/teacher setup steps. GitHub account creation stays on GitHub; Zero's
explicit project commands create repositories only after collecting the choices below.

## Start a tutorial or project

On the **Zero Start Page**, follow: **Sign in to GitHub**, then
**Install Zero for GitHub** if requested, then **Start tutorial**.
Sign-in uses Zero's existing GitHub device flow and credentials. After sign-in,
Zero checks App access for repository creation and contents writing; the check is
read-only and stops at the next Start Page step. If access is missing, **Install Zero
for GitHub** opens the pinned App page after a read-only recheck. Approve selected
repositories there; Zero never asks for all-repository access. Return to Zero and
it checks again automatically. Use **Check again** if needed. Escape or a failed
check leaves the matching step available to retry. A saved session is checked
read-only on launch without opening a browser or starting sign-in. Local Run and
Files remain available signed out or offline; cloud repository, push and sharing
controls appear after access is ready. App-created repositories are accessible
automatically.

When ready, **Start tutorial** creates the selected scaffold. **Start Page → Project → New**
creates original work instead, so students can skip the tutorial. **Start Page → Project → Open** opens existing work; Troubleshooting is in the sidebar’s **⋯** menu. Enter a repository name and choose
a parent folder before creation. Zero creates a public repository in your GitHub
account, verifies access, clones and opens the project in the current VS Code window. Its
source and included files are public.
The **Clone location** chooser starts at `~/Zero Projects`; keep it or choose
another folder outside any Git repository, then choose **Clone here**.
For an existing repository, choose **Start Page → Project → Clone**, paste its
HTTPS URL and ensure it is available to Zero's App. A failed or uncertain creation
keeps its recovery link and offers **⋯ → Repository Actions → Resume created project…**; a failed
clone keeps its partial folder. Check those before retrying or creating another repository.

For an existing cloned Zero folder, choose **Start Page → Project → Open**;
it opens that valid project without cloning again, using the same window policy. An original
local project without a GitHub origin offers **⋯ → Repository Actions → Create a repository…**
to create and connect an empty public remote after entering its name.
**⋯ → Repository Actions → Connect to GitHub…** connects an existing repository URL locally;
it does not push or prove remote access. Connected projects show
owner/repository and retain branch actions, with **Publish app** in the menu.
Zero's own clone/push/publish commands use its guarded connection. General Source
Control and terminal network commands do not inherit that connection automatically.

## Native setup

Published Mac0.5.14 uses **drag Zero.app to Applications → open Zero → Run App**.
First launch prepares `~/Zero`, private verified Java and a separate editor
configuration, then opens the editor automatically. A recognized existing kit
receives only setup-file updates while preserving student projects. The app
closes its preparation window after handing off to VS Code. Later openings
verify the current installation and restore the saved Zero editor session without
recopying the kit. Failed opening offers Try again and Details.

Earlier Mac downloads retain their original setup apps and immutable bytes. Windows and ZIP/manual
setup retain their existing guidance. See [native app](INSTALLER.md) for isolation,
downloads and platform limits.

## ZIP/manual student flow

1. Download and extract the complete kit.
2. If the kit includes a `setup/` folder, open setup/Setup.cmd on Windows or
   setup/Setup.command on a supported Mac. The published 0.5.3 ZIP uses the
   [manual setup steps](GETTING-STARTED.md#one-time-setup).
3. Check existing installations. Choose installation/help only for missing or
   incompatible items. A working school/personal installation should be reused.
4. Follow profile prompts, install Zero and Java extensions, and open Zero.
5. Complete the account/privacy preflight above before lesson 0. Choose
   **Start tutorial**, connect GitHub if needed, then name and save your own
   **Greeting app** repository. Zero opens your clone with Main and Tutorials.
   Submit repository links in Pika separately when assigned.
6. If setup needs troubleshooting, **Troubleshooting → Test installation** opens the
   completed bundled Hello World app in a separate window marked Installation
   test. Choose **Run test** and confirm its native JavaFX window. This is optional;
   it is separate from your tutorial. Older kits retain their bundled instructions.

## Automation boundaries

The kit has no student Node.js/Python requirement. The Windows/macOS launchers
use native shell tools and offer existing package managers or official download
pages; they never install a package manager, silently elevate, weaken execution
policy globally, uninstall working tools or change account credentials.
Installer permission prompts and school restrictions remain normal operating
system decisions. Manual setup remains available when scripts are blocked.

The extension checks JAVA_HOME first, as the Maven wrapper does,
or java/javac on PATH when JAVA_HOME is unset. These probes use the VS Code
process environment. If VS Code terminal settings override build/tool variables,
setup reports Run readiness as unverified and explains which setting needs
review; it does not change those settings or recommend its first-run action.
Ordinary Run App remains available for a teacher/IT-reviewed configuration.
Java and its compiler need compatible matching JDK17+ versions. In manual setup,
a bad JAVA_HOME must not be hidden by a working PATH installation. The new native
Mac launcher explicitly selects Zero’s private JDK only for its own editor and
child processes; it does not repair or change the system JAVA_HOME.
Git 2.31+ is required before tutorial lesson 0 because the lessons use real
uploads. Troubleshooting includes Git in tutorial Run readiness; ordinary local apps
can run without Git. Java editor support and the debugger are checked in the
active VS Code profile; debugger absence does not block Run App. Installed
extensions in another profile do not satisfy this check.

Extension repair invokes VS Code's supported extension installer on explicit
selection. Java/Git repair opens an official installer page. Fully quit/reopen
VS Code after installing tools or repairing environment variables, then Check
again. Run current app saves the project and uses its Maven wrapper to build and
open a native JavaFX window. Build errors appear in the task terminal and Problems.
Local Run and Run test skip browser compatibility checks and WebFX compilation;
Publish app or advanced Export for web performs those checks when requested.
A missing or malformed project, timeout, unparseable version or failed tool check
must not be reported as ready. On a supported Mac, the wrapper must also have
execute permission; re-extract the complete kit or follow the reported local
permission repair guidance. Checks do not execute the project's Maven build.

Before tutorial lesson 0, students complete the GitHub account, school access
and privacy steps, then create and clone their own tutorial repository. In that
clone, configure its teacher-approved Git identity before the first upload.
After cloning and caching the build tools, local Run works offline
without an active GitHub session; uploads require sign-in and internet access.
GitHub actions default to live. Check your work before choosing an action;
entering a branch name or commit message proceeds directly, and Merge to main
starts when clicked. First Publish approves its public destination once; later
explicit Publish actions update that site. With Zero's updated GitHub permission
approved, Publish sets up a missing app page automatically. It updates recognized
untouched older helpers before committing and recovers confirmed stopped build
locks. It preserves your helper edits, existing sites and repository visibility.
Troubleshooting and installer checks do not create accounts or repositories, upload,
publish or submit anything in Pika; the separate project commands above create
repositories only when explicitly chosen.

Optional ZeroHub browser sign-in uses the same Codepet App and numeric GitHub
identity, with a separate credential family. Its user token can carry the App's
installed repository permissions as well as starring; it is not a star-only
credential. Browser sessions currently require reconnection after eight hours.
Desktop sign-in does not pair the browser or transfer credentials to it.

## Verification contract

Use disposable fake tools and kit paths containing spaces to check detection,
missing/old/mismatched versions, JAVA_HOME precedence, profile consistency,
quoted commands, cancelled actions, install failures and rechecks. Never run
installation tests against the developer's real system or credentials.
Verify the ZIP contains launchers plus generated version metadata and executable
shell permissions, excludes maintainer setup tests, and still compiles standalone.
Record executed checks and platform gaps in docs/VERIFICATION.md.

Physical clean-machine Windows/macOS installers, permission prompts, package
manager availability, proxies/school policy and novice usability need separate
verification. Retained Linux wrappers and universal Mac artifacts are legacy
technical capabilities, not supported MVP setup paths. No unattended installer or
fully automated school enrollment is claimed.
Earlier native sign-in evidence does not verify the new App flow. Live selected
installation, automatic access to created repositories, private clone, refresh,
revocation, browser identity and Windows acceptance remain activation checks.

Primary references: [VS Code CLI](https://code.visualstudio.com/docs/configure/command-line),
[VS Code built-in commands](https://code.visualstudio.com/api/references/commands),
[Windows winget install](https://learn.microsoft.com/en-us/windows/package-manager/winget/install),
[Temurin downloads](https://adoptium.net/temurin/releases/?version=17&package=jdk),
[Git downloads](https://git-scm.com/downloads/).

## Installer packaging direction

Native installers embed the complete kit and use a small window with one replacing
status line. Published Mac0.5.7 is signed and notarized; it automatically prepares
Java and a separate Zero editor configuration. It uses `~/Zero`, asks before
updating an existing kit and preserves student projects. Windows development
installers remain unsigned previews; physical Windows testing is deferred.
Keep the ZIP/manual path for managed machines; see
[installer direction](INSTALLER.md).
