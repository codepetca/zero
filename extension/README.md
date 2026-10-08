# Zero extension — local prototype

Open a student folder containing `zero.json`, or the kit with its
`student-template/zero.json`. The extension uses supported VS Code sidebar,
webview, file tree, task and command APIs. Files open in the normal editor.

Import the settings-only Zero profile first, then install the local
**zero-0.2.0.vsix**, `redhat.java` and `vscjava.vscode-java-debug` in that profile.
The extension ID is **zero.zero**. **Zero: Show Sidebar** reveals the sidebar
when the activity bar is hidden; a marked workspace reveals it on first activation.

Run App saves files and runs the project's Maven wrapper with separate
`clean`, `compile` and `javafx:run` arguments. Cleaning avoids stale classes from
the language server. Stop terminates the owned task; restart waits for it to end.
The app opens in a separate native window, with rebuild/restart rather than hot
reload. The default build shortcut uses the same TaskProvider:

```json
{"version":"2.0.0","tasks":[{"type":"zero","task":"run","label":"Zero: Run App","group":{"kind":"build","isDefault":true},"problemMatcher":"$zero-java"}]}
```

Windows uses the task shell with strong wrapper-path quoting; other platforms
use a process task. Physical Windows/Linux behavior remains unverified.
Compiler output stays in the task terminal. `$zero-java` matches Maven
`[ERROR] /absolute/File.java:[line,column] message` output; installed Java
language support supplies editor diagnostics.

Commands: `zero.runApp`, `zero.stopApp`, `zero.uploadToGitHub`,
`zero.connectRepository`, `zero.copyRepositoryLink`, `zero.showSetup` and
`zero.showSidebar`.

## Repository workflow

Connect Repository accepts an ordinary `https://github.com/owner/repository`
page URL, optionally ending in `.git`. It initializes Git in the exact marked
standalone project when needed and sets origin. Replacing origin requires
confirmation. A project nested inside another Git repository is rejected: copy
the starter outside the kit first. Connection does not verify GitHub existence,
ownership or authentication, and never changes global Git config/credentials.

**Upload defaults to simulation — nothing uploaded.** Simulation does not stage,
commit, push or authenticate. Workspace setting `"zero.uploadMode": "live"`
enables the implemented real-upload path. It saves files, asks for a commit
message, and shows a modal review of the repository, branch and changed paths.
**Commit & Upload** stages reviewed changes, makes a commit when needed, pushes
with standard Git HTTPS transport and checks the remote branch before reporting
success. Ignored files stay local. A failed push may leave the local commit.

Students need Git name/email identity and a working Git credential helper/browser
flow. VS Code GitHub UI sign-in alone may not configure the separate Git process.
Zero collects no tokens or passwords. Setup help reports Java/compiler, Git,
Java extensions and upload mode. Local running needs no GitHub sign-in.

Copy Repository Link returns the clean page URL for separate Pika submission.
Students create their own empty repositories; no GitHub Classroom is involved.
See the bundled `GETTING-STARTED.md` for the beginner workflow.

## Development and verification

The webview uses theme variables, keyboard-accessible buttons, escaped status,
a nonce-based Content Security Policy and no external network resources.
After root dependency installation, from this directory:

```sh
npm test
npm run package
```

Packaging uses pinned `@vscode/vsce` and creates a local VSIX; it never publishes.
Tests cover root guards, review/staging/commit behavior, cancellation, errors,
simulation and intercepted transport. Actual GitHub authentication/upload and
student pilots are unverified. Mac profile/sidebar and app checks are recorded
in the bundled `VERIFICATION.md`; physical Windows/Linux checks
remain pending. Review focused changes before classroom adoption.
