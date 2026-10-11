# Guided student setup

The local0.5.4 kit provides check-and-repair help for personal and school laptops.
Published0.5.3 remains available and unchanged. No new release is published by
this implementation. The complete kit owns setup launchers; the starter-only ZIP
continues to be an ordinary editable Java project.

## Student flow

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
Java and its compiler need compatible matching JDK17+ versions. A bad JAVA_HOME must not be hidden by a working PATH installation.
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

The native installer will wrap these checks and repair actions. Windows would
use a per-user setup EXE; macOS would use a setup app inside a DMG. No native
installer has been built or published yet. Keep the ZIP/manual path for managed
school machines. See [installer direction](INSTALLER.md).
