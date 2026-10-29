# Set up Zero

This MVP supports Mac with Apple Silicon and Windows. Linux and Intel Macs are
unsupported.

For the published **Mac 0.5.14** app, open the DMG and drag **Zero.app** into
**Applications**. Open Zero there: **Preparing Zero…** and a progress bar appear
while it prepares Java and a separate configured editor, then the editor opens
automatically. Reopen Zero from Applications or the Dock to return to your saved
editor session. No manual profile import is needed in this native Mac flow.

Older **Mac 0.5.10** downloads retain **Set up Zero** and **Update Zero** actions;
**0.5.11** offers **Open Zero** after preparation. Those older kits use
**Open Zero.command** in the home Zero folder for later launches. Follow the guide
bundled with your downloaded version.

The instructions below describe the **ZIP/manual launchers** and Windows setup.

Extract the **whole** Zero kit first. Keep the `setup`, `starter` and `optional`
folders beside the kit's Zero VSIX. Choose a folder you can write to, such as
Documents. On a school laptop, your device administrator or IT may need to install software.

- **Windows:** double-click `Setup.cmd`.
- **Mac:** double-click `Setup.command`. If macOS blocks the file, follow your
  school's approved process or ask your device administrator or IT. Do not disable security controls.

Setup first shows what is ready and what needs attention. Choose install help
only for tools you need: a compatible **VS Code** and a **JDK 17 or newer** run your apps.
The kit's generated metadata supplies the VS Code minimum (currently 1.95.0);
setup accepts newer stable versions in the same major. A missing, failed or
unreadable version does not pass. Setup reports the selected version and path,
plus old or unusable candidates. It checks the PATH command and standard stable
VS Code application locations on Windows and Mac; custom installations may need
help from a device administrator or IT to expose their supported CLI.
**Git 2.31 or newer** is part of setup before tutorial lesson 0 because lessons
use authenticated Zero uploads. Ordinary local starter apps can run without Git;
after tutorial cloning, Run needs no active GitHub sign-in. A JDK
includes both `java` and `javac` with matching major versions; a runtime alone is insufficient. You do
not need Node.js, Python or a global Maven installation.

Each installation needs its own yes/no choice. Setup can use **existing**
Windows winget or Mac Homebrew, with the normal installer consent/admin prompts.
It does not install a package manager. Alternatively it offers an official
download page. If installation is blocked, show the check summary to your
device administrator or IT; do not try to bypass school restrictions. After an install, close
VS Code completely and reopen setup. Windows may need a restart to update
PATH/JAVA_HOME. An installer exit code does not mean setup is ready: check again.
For a package already recorded by the manager, setup offers a specific upgrade
only when it can verify one is available. If the package is current, or its
inventory cannot be checked, setup asks for configuration/restart help instead
of reinstalling. It displays the proposed package command before your choice and
checks again after a package operation.

If the check mentions a broken/old `JAVA_HOME`, ask your device administrator or IT to select
the installed JDK. Setup honours that choice and does not change saved system
variables. On Mac, if `JAVA_HOME` is unset, setup selects an installed JDK 17+
for this setup process. The same environment is passed to the editor it opens;
close all existing VS Code windows first so they do not retain an old environment.
An incompatible explicit `JAVA_HOME` always needs manual correction before any
JDK installation through setup. Java and Git checks show the selected command
paths. Git uses the first PATH installation; setup does not inventory every Git
or JDK on the machine. If another installation should be selected, ask a device administrator or IT
to review PATH or JAVA_HOME, then restart and check again.

## Your Zero profile (ZIP/manual setup)

All extension checks and installs use a VS Code profile named **Zero**. Extensions
installed only in Default or another profile will not count as ready here.

If you want the optional quiet settings, import them **before** installing
extensions: open VS Code, choose **Profiles > Import Profile > Select File**,
select `optional/Zero.code-profile` and use the name **Zero**. Return to setup.
If you already have a Zero profile, keep it; importing again is unnecessary.

Alternatively choose **Open/create Zero profile** in setup. That opens an empty
Zero profile if needed; it does not import the optional settings. Then choose
**Install missing extensions in Zero**. Setup asks separately for Zero, Java
language support and the optional Java debugger. A missing debugger does not block
Run App. It preserves an already installed Zero
version at least as new as this kit, and does not force a downgrade.

Choose **Check again**, then **Open starter** when the required checks pass.
In the editor, choose **Run App** in Zero. First run needs internet to download
the project's pinned Maven and JavaFX dependencies. Setup readiness checks tools,
the profile's installed extensions and required project files; it does not build
your app, prove that extensions are enabled, or test school network permissions.
If Java/editor support reports an additional runtime requirement, use Zero's
in-editor **Setup Help** or ask your device administrator or IT. GitHub sign-in is separate and is
not required for local running.

## Read-only checks and troubleshooting

- Windows: `setup\Setup.cmd --check` (PowerShell directly: `setup\Setup.ps1 -Check`).
- Mac/Linux: `bash setup/setup.sh --check`.

Checks never install, open a browser or launch an editor window. Tool CLI probes
may write their normal logs/cache. A missing Zero profile is reported without
creating it. Exit 0 means required checks passed; nonzero means something needs
attention. Git is optional. Tool checks time out after 20 seconds; close setup
and retry if a local command is stuck. Installers keep their own prompts, and
extension installs have a five-minute limit on Windows.

If a kit file or `setup/kit.properties` is missing, extract the complete kit
again. That generated metadata identifies the packaged version, local VSIX and
VS Code compatibility minimum derived from the extension's manifest.
Do not copy only the launcher out of the kit. Windows script policy may block
setup. Windows offers **Run normally** or an explicit **one-process allowance**
for this trusted downloaded script. The latter uses process-only execution
policy and is unavailable if MachinePolicy/UserPolicy is configured (or cannot
be checked). It never changes saved policy. Choose it only where your school
permits running this kit; enforced school policy requires help from a device administrator or IT.
Read-only checks use normal policy and may be blocked too. Your device administrator or IT can install
the same tools and extensions using the normal interfaces.

Primary vendor guidance: [VS Code downloads](https://code.visualstudio.com/download),
[VS Code profile/extension CLI](https://code.visualstudio.com/docs/configure/command-line),
[Temurin JDK downloads](https://adoptium.net/temurin/releases/?version=17),
[Git downloads](https://git-scm.com/downloads).
Upgrade/inventory commands follow [winget upgrade](https://learn.microsoft.com/en-us/windows/package-manager/winget/upgrade)
and the [Homebrew manual](https://docs.brew.sh/Manpage).
Package names are verified against Microsoft's
[VS Code winget manifest](https://github.com/microsoft/winget-pkgs/tree/master/manifests/m/Microsoft/VisualStudioCode),
[Temurin 17 JDK manifest](https://github.com/microsoft/winget-pkgs/tree/master/manifests/e/EclipseAdoptium/Temurin/17/JDK),
[Git manifest](https://github.com/microsoft/winget-pkgs/tree/master/manifests/g/Git/Git)
and Homebrew's official [VS Code](https://formulae.brew.sh/cask/visual-studio-code),
[Temurin 17](https://formulae.brew.sh/cask/temurin@17) and
[Git](https://formulae.brew.sh/formula/git) entries.
Microsoft explains [PowerShell process policy and Group Policy precedence](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies).

For maintainers: `node --test setup/tests/setup.test.mjs` uses fake tools and
temporary kits; no installs or editor windows. Physical Windows/Linux, school
restrictions, real package-manager installs and novice usage need classroom testing.
