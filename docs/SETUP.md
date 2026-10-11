# Guided student setup

The signed Mac0.5.7 setup provides automatic Java/editor preparation for personal
and school laptops. The independently published0.5.3 ZIP remains unchanged. The complete kit owns setup launchers; the starter-only ZIP
continues to be an ordinary editable Java project.

## Native setup

The published Mac0.5.7 setup uses **Set up Zero → Open Zero → Run App**.
It uses `~/Zero`, asks before updating an existing kit, and preserves the student
project. Background work uses one small window with a replacing status message.
It automatically prepares a private verified JDK21, reuses compatible VS Code or
installs a verified user-local copy, seeds separate Zero editor settings, and
installs required extensions. No profile import or Java version selection is
needed. Use `~/Zero/Open Zero.command` to reopen that configured editor.

Mac0.5.6 remains available as a previous release with its older setup flow.
Windows and ZIP/manual setup retain their existing guidance.
Details and failures remain visible; GitHub sign-in comes later. See
[native setup](INSTALLER.md) for isolation, downloads and platform limits.

## ZIP/manual student flow

1. Download and extract the complete kit.
2. Open setup/Setup.cmd on Windows or setup/Setup.command on macOS. Linux uses
   bash setup/setup.sh with manual tool-installation guidance.
3. Check existing installations. Choose installation/help only for missing or
   incompatible items. A working school/personal installation should be reused.
4. Follow profile prompts, install Zero and Java extensions, and open starter.
5. In Zero, use Setup help to check project tools and the current profile.
   Choose Run first app and confirm that the separate greeting window opens.
6. Start Lesson0. Set up GitHub later when ready to share work and submit in Pika.

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
Git2.31+ is checked separately for optional sharing. Java editor support and the
debugger are checked in the active VS Code profile; debugger absence does not
block Run App. Installed extensions in another profile do not satisfy this check.

Extension repair invokes VS Code's supported extension installer on explicit
selection. Java/Git repair opens an official installer page. Fully quit/reopen
VS Code after installing tools or repairing environment variables, then Check
again. Run first app uses the existing saved, clean-compile, native-window flow.
A missing or malformed project, timeout, unparseable version or failed tool check
must not be reported as ready. On macOS/Linux, the wrapper must also have
execute permission; re-extract the complete kit or follow the reported local
permission repair guidance. Checks do not execute the project's Maven build.

GitHub sign-in, repository creation/connection and local Git name/email remain
student steps when sharing starts. Upload simulation stays the default. Setup
does not opt into live uploads, create a repository or submit anything in Pika.

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
verification. Linux tool installation stays manual. No unattended installer or
fully automated school enrollment is claimed.

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
