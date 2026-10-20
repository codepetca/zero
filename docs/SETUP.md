# Guided student setup

Windows0.5.18 native automatic setup is a local development candidate; see
[Windows installation and updates](WINDOWS-INSTALLER.md). The published Windows
download still uses the ZIP/manual instructions below until a signed, tested
release is authorized.

The current MVP targets **Mac with Apple Silicon** and **Windows**. Linux and
Intel Macs are unsupported. The signed Mac0.5.14 app provides automatic
Java/editor preparation for supported personal and school Macs. Windows uses
the published complete-kit ZIP for manual setup; its native EXE is unpublished.
Download choices show the Windows ZIP alongside Mac. The independently published
0.5.10 ZIP remains unchanged. The complete kit owns setup launchers; the starter-only ZIP
continues to be an ordinary editable Java project.

The guided project-access check below describes the local 0.5.24 release
candidate. Mac 0.5.23 and other published kits retain their bundled sign-in and
project instructions. The Codepet Zero GitHub App is registered under
`codepetca`, with its public IDs pinned in source. Live acceptance, production
activation and release promotion remain pending. See [the identity plan](ZERO-IDENTITY-PLAN.md).

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

Choose **Start tutorial** in the native welcome. If needed, complete the existing
GitHub device sign-in with your personal account. Before showing tutorial choices
or asking for a repository name or location, Zero makes a read-only check of the Codepet App's
access in that account for repository creation and contents writing.
If access is missing, use the native **Connect GitHub · project access** picker:
**Open GitHub** opens the pinned App page, where you review and approve selected
repositories. Zero never asks for all-repository access. Return to Zero; it
rechecks and continues automatically when ready. **Check again** is available if
the automatic check does not finish. Escape cancels and leaves **Start tutorial**
available to retry. Rechecks that detect network or account changes never create
a repository. A direct palette **Sign in** follows the same access guidance and
reveals the Zero sidebar. App-created repositories are accessible automatically.

After access is ready, choose **Start tutorial** and its scaffold, or
**Project → New project…** for original work. Enter a repository name and choose
a parent folder before creation. Zero creates a public repository in your GitHub
account, verifies access, clones and opens the project in a new window. Its
source and included files are public.
The **Clone location** chooser starts at `~/Zero Projects`; keep it or choose
another folder outside any Git repository, then choose **Clone here**.
For an existing repository, choose **Project → Clone from GitHub…**, paste its
HTTPS URL and ensure it is available to Zero's App. A failed or uncertain creation
keeps its recovery link and offers **Project → Resume created project…**; a failed
clone keeps its partial folder. Check those before retrying or creating another repository.

For an existing cloned Zero folder, choose **Project → Open local project…**;
it opens that valid project in a new window without cloning again. An original
local project without a GitHub origin offers **Project → Create a repository…**
to create and connect an empty public remote after entering its name.
**Project → Connect to GitHub…** connects an existing repository URL locally;
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
6. If setup needs troubleshooting, **Setup help → Test installation** opens the
   completed bundled Hello World app in a separate window marked Installation
   test. Choose **Run test** and confirm its browser preview. This is optional;
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
uploads. Setup Help includes Git in tutorial Run readiness; ordinary local apps
can run without Git. Java editor support and the debugger are checked in the
active VS Code profile; debugger absence does not block Run App. Installed
extensions in another profile do not satisfy this check.

Extension repair invokes VS Code's supported extension installer on explicit
selection. Java/Git repair opens an official installer page. Fully quit/reopen
VS Code after installing tools or repairing environment variables, then Check
again. Run current app saves the project, checks browser compatibility, builds it
and opens the browser preview. Build errors appear in Zero Output and Problems.
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
explicit Publish actions update that site. The App omits Administration permission.
For first-time Pages setup, enable GitHub Actions as the Pages source in GitHub
settings, then return to Publish app and recheck. Keep your repository visibility.
Setup Help and installer checks do not create accounts or repositories, upload,
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
installers remain unsigned and local; physical Windows testing is deferred.
Keep the ZIP/manual path for managed machines; see
[installer direction](INSTALLER.md).
