# Zero extension — local prototype

Open a student folder containing `zero.json`, or the kit with its
`student-template/zero.json`. The extension uses supported VS Code sidebar,
webview, file tree, task and command APIs. Files open in the normal editor.

Import the settings-only Zero profile first, then install the local
**zero-0.3.0.vsix**, `redhat.java` and `vscjava.vscode-java-debug` in that profile.
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
`zero.signInToGitHub`, `zero.createRepository`, `zero.connectRepository`,
`zero.copyRepositoryLink`, `zero.showSetup` and
`zero.showSidebar`.

## Repository workflow

The GitHub section follows your state: **Sign in to GitHub** when signed out;
**Create repository** and **Connect existing repository** when signed in without
an origin; **Upload to GitHub** and **Copy repository link** when connected.
Run App always works without sign-in. The signed-in account is shown, with
**Change GitHub account** using VS Code's account selector.

Sign-in uses VS Code's built-in GitHub authentication provider. It requests
`repo` access, including private repositories, so students can choose Public or
Private on GitHub. VS Code owns the sign-in and storage. Zero silently checks
existing sessions on activation; only an explicit sign-in/account action can
open the native authentication flow. Zero has no account, password or token UI.

Create repository opens [GitHub's new repository page](https://github.com/new).
Use the same account as Zero and create an empty repository: leave README,
.gitignore and license unselected. Return to Zero and connect its page link.
Connect accepts `https://github.com/owner/repository`, optionally ending in
`.git`. It initializes Git only in the marked standalone project and sets
origin; replacement requires confirmation. Copy the starter outside the kit
if it is nested inside another Git repository. Connecting is local and does
not verify GitHub ownership, existence or permission.

**Upload defaults to simulation — nothing uploaded.** Simulation does not stage,
commit, push or open sign-in. Workspace setting `"zero.uploadMode": "live"`
enables live upload. After signing in, save files, enter a commit message and
review the account, repository, branch and changed paths. **Commit & Upload**
stages reviewed changes, commits when needed, pushes and checks the remote
branch. Ignored files stay local. A failed push may leave a local commit.

Live transport receives the captured VS Code session in transient child-process
Git configuration scoped to that exact GitHub HTTPS repository. Zero writes no
credential/config file, changes no global Git credentials, disables hooks and
redirects for these transport processes, and keeps credentials out of process
arguments and displayed errors. An empty temporary hook directory is removed
when the process completes. Native session changes invalidate the review;
session/account/token are rechecked before push and remote confirmation.
Local Git inspection and commits receive no native-session credentials.

Git still needs your name/email identity configured for this student repository.
GitHub sign-in does not configure commit identity. For example, use
`git config --local user.name "Your Name"` and
`git config --local user.email "your GitHub email"` inside your student folder.
Zero leaves that choice to you. Setup help reports local tools and upload mode.

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
simulation, native session changes, credential isolation/cleanup and intercepted
transport. Actual GitHub authentication/upload and
student pilots are unverified. Mac profile/sidebar and app checks are recorded
in the bundled `VERIFICATION.md`; physical Windows/Linux checks
remain pending. Review focused changes before classroom adoption.
