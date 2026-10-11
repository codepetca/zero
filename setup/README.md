# Set up Zero

Extract the **whole** Zero kit first. Keep the `setup`, `starter` and `optional`
folders beside the kit's Zero VSIX. Choose a folder you can write to, such as
Documents. On a school laptop, your teacher or IT may need to install software.

- **Windows:** double-click `Setup.cmd`.
- **Mac:** double-click `Setup.command`. If macOS blocks the file, follow your
  school's approved process or ask your teacher. Do not disable security controls.
- **Linux:** open a terminal in the extracted kit and run `bash setup/setup.sh`.
  Setup checks your tools and links to official downloads. Your teacher/IT can
  help choose your distribution's installation method.

Setup first shows what is ready and what needs attention. Choose install help
only for tools you need: **VS Code** and a **JDK 17 or newer** run your apps.
**Git 2.31 or newer** is optional until you want to share with GitHub. A JDK
includes both `java` and `javac` with matching major versions; a runtime alone is insufficient. You do
not need Node.js, Python or a global Maven installation.

Each installation needs its own yes/no choice. Setup can use **existing**
Windows winget or Mac Homebrew, with the normal installer consent/admin prompts.
It does not install a package manager. Alternatively it offers an official
download page. If installation is blocked, show the check summary to your
teacher/IT; do not try to bypass school restrictions. After an install, close
VS Code completely and reopen setup. Windows may need a restart to update
PATH/JAVA_HOME. An installer exit code does not mean setup is ready: check again.

If the check mentions a broken/old `JAVA_HOME`, ask your teacher/IT to select
the installed JDK. Setup honours that choice and does not change saved system
variables. On Mac, if `JAVA_HOME` is unset, setup selects an installed JDK 17+
for this setup process. The same environment is passed to the editor it opens;
close all existing VS Code windows first so they do not retain an old environment.

## Your Zero profile

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
in-editor **Setup Help** or ask your teacher. GitHub sign-in is separate and is
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
again. That generated metadata identifies the packaged version and local VSIX.
Do not copy only the launcher out of the kit. Windows script policy may block
setup. Windows offers **Run normally** or an explicit **one-process allowance**
for this trusted downloaded script. The latter uses process-only execution
policy and is unavailable if MachinePolicy/UserPolicy is configured (or cannot
be checked). It never changes saved policy. Choose it only where your school
permits running this kit; enforced school policy requires teacher/IT help.
Read-only checks use normal policy and may be blocked too. Your teacher/IT can install
the same tools and extensions using the normal interfaces.

Primary vendor guidance: [VS Code downloads](https://code.visualstudio.com/download),
[VS Code profile/extension CLI](https://code.visualstudio.com/docs/configure/command-line),
[Temurin JDK downloads](https://adoptium.net/temurin/releases/?version=17),
[Git downloads](https://git-scm.com/downloads).
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
