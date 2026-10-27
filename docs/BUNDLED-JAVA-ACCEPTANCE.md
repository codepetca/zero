# Bundled Java: release acceptance handoff

Source integration keeps the kit version unchanged. Zero Architecture owns the
single combined Mac0.5.54/build54 installer, signing, publication and feed work.
Do not rebuild sealed Mac53 assets, remove retained QA artifacts, recreate QA
repositories, or change system Java, shell files or normal VS Code settings.

## Evidence already available

`docs/EVIDENCE.md` records complete source review plus both correction deltas.
Task-local logs are in `.verification/bundled-java/`: focused/native harness logs,
`maven-java21.log`, `real-runtime.json`, `real-update-handoff-final.json` and the
full initial suite. The native harness verified settings generation/repair,
BOM/malformed-file preservation, stale paths and child-only environment changes.
Those checks do not establish real editor/update or physical Windows acceptance.
Retain earlier release evidence in
`/Users/stew/.codex/worktrees/actor/zero/.verification/mac53`.

## Isolated Mac editor / terminal / extension-upgrade smoke

Use an owned QA Code copy/CLI from the Mac53 acceptance evidence, or the installed
VS Code CLI at `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`.
Always provide both isolation directories below; never use a plain `code` launch.
Prerequisites: the verified candidate app's `Contents/Resources/kit` directory,
its exact candidate VSIX, baseline Mac53 VSIX, an already-installed JDK17 or25,
and the existing verified Zero private runtime. Do not install a system JDK for
this test. Candidate paths/version must come from the release receipt.

Set these task-specific shell variables to real absolute locations:

```sh
ZERO_QA_CODE='/absolute/owned/Code.app/Contents/Resources/app/bin/code'
ZERO_QA_KIT='/absolute/sealed/candidate/Zero.app/Contents/Resources/kit'
ZERO_QA_BASELINE_VSIX='/Applications/Zero.app/Contents/Resources/kit/zero-0.5.53.vsix'
ZERO_QA_OLD_JDK="$(/usr/libexec/java_home -v 17)"
ZERO_QA_ROOT="$(mktemp -d /tmp/zero-java-acceptance.XXXXXX)"
ZERO_QA_HOME="$ZERO_QA_ROOT/home"
ZERO_QA_DATA="$ZERO_QA_HOME/Library/Application Support/Zero"
ZERO_QA_USER="$ZERO_QA_DATA/editor/user-data"
ZERO_QA_EXTENSIONS="$ZERO_QA_DATA/editor/extensions"
```

Before copying runtimes, run the owner's storage guard with `check --fresh
--required-gb 2`. In the QA home only, copy the exact `jdk-<sha256>` and
`node-<sha256>` directories named by the candidate's `setup/mac-downloads.json`
from `~/Library/Application Support/Zero/runtime/` to
`$ZERO_QA_DATA/runtime/`, retaining their asset receipt files and vendor layout.
Use real copies, not symlinks to personal profiles or runtime receipt files.
The macOS JDK path is
`$ZERO_QA_DATA/runtime/jdk-<sha256>/<jdk.version>/Contents/Home`; Node is
`$ZERO_QA_DATA/runtime/node-<sha256>/node-v<node.version>-darwin-arm64/bin/node`.
Call those paths `ZERO_QA_JDK` and `ZERO_QA_NODE` for the commands below.

Copy only candidate `starter/` to `$ZERO_QA_ROOT/project`. It is a disposable local
app; no GitHub repository/sign-in/upload is needed. Install baseline Zero and
Red Hat Java in the QA extension directory (copy the existing platform-specific
Red Hat extension only, or use the scoped CLI install command). The Java extension
keeps its own tooling JRE; never set `java.jdt.ls.java.home` to JDK21.

```sh
"$ZERO_QA_CODE" --user-data-dir "$ZERO_QA_USER" --extensions-dir "$ZERO_QA_EXTENSIONS" --install-extension "$ZERO_QA_BASELINE_VSIX"
"$ZERO_QA_CODE" --user-data-dir "$ZERO_QA_USER" --extensions-dir "$ZERO_QA_EXTENSIONS" --install-extension redhat.java
```

Prepare only `$ZERO_QA_USER/User/settings.json` with the Java-owned settings
produced by current `MacRuntime.managedSettings`: JavaSE21 at `ZERO_QA_JDK`,
`java.import.gradle.java.home` at that path, `terminal.integrated.env.osx` with
JAVA_HOME/ZERO_JAVA_HOME at that path and PATH=`<jdk>/bin:${env:PATH}`,
MAVEN_SKIP_RC=`1`, and null JAVA_TOOL_OPTIONS/JDK_JAVA_OPTIONS/_JAVA_OPTIONS/
MAVEN_OPTS/MAVEN_ARGS. The `Zero Java` profile uses `/bin/zsh`, args `["-f"]`,
the same environment, and is the default terminal profile. This isolated profile
preparation tests the editor boundary; native harnesses cover its actual writer.
Do not copy authentication/global-storage data or personal user settings.
Write a QA-home-only `.zshrc` that selects `ZERO_QA_OLD_JDK`; this is the hostile
startup fixture, not an edit to the owner's real shell configuration.

Start the baseline editor with the old Java and **without** the new launcher
marker. Keep this process/window open across the extension upgrade:

```sh
env -u ZERO_JAVA_HOME -u VSCODE_IPC_HOOK_CLI -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS -u NODE_PATH HOME="$ZERO_QA_HOME" JAVA_HOME="$ZERO_QA_OLD_JDK" ZERO_KIT_DIR="$ZERO_QA_KIT" ZERO_NODE_EXECUTABLE="$ZERO_QA_NODE" "$ZERO_QA_CODE" --new-window --user-data-dir "$ZERO_QA_USER" --extensions-dir "$ZERO_QA_EXTENSIONS" "$ZERO_QA_ROOT/project"
```

Install the exact candidate VSIX into those same QA directories, then use
**Developer: Reload Window** in that window; do not quit/relaunch Code first:

```sh
"$ZERO_QA_CODE" --user-data-dir "$ZERO_QA_USER" --extensions-dir "$ZERO_QA_EXTENSIONS" --install-extension '/absolute/candidate/zero-0.5.54.vsix' --force
```

1. Run **Zero: Troubleshooting**: it must report bundled JDK21, not the old
   process JAVA_HOME. Run the app; retain the task output and successful window.
2. Open a new default **Zero Java** terminal. Run `echo "$JAVA_HOME"`,
   `command -v java`, `java -XshowSettings:properties -version`, and `javac -version`.
   `java.home`/executables must point into the QA private JDK and both tools be21.
   The QA `.zshrc` must not change that selection.
3. Reload once more and repeat Run/terminal checks. Existing Code process state
   must not restore old Java. Do not sign in, upload or publish the disposable app.
4. On this disposable copy only, rename the private JDK folder, invoke Run, and
   confirm repair guidance with no system-Java fallback. Restore the directory
   immediately; keep all real Zero/system runtimes untouched.
5. Close only the owned QA window/app. Retain QA logs/screenshots and record the
   exact candidate/source identity. Do not delete other artifacts or QA state.

The native installed Mac53→54 bootstrap/update path, normal Zero profile repair,
Hot Exit/unsaved work preservation and signed installer acceptance are additional
release checks owned by the coordinator; the isolated extension smoke above
must not be described as proving those native UI flows. Physical Windows remains
separate from the passing Windows source/harness checks.
