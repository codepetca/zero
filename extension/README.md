# Zero extension

Zero **0.5.43** uses core **0.2.1**. Each published download retains its
bundled extension version and behavior.

Run App opens a native JavaFX window. Mac 0.5.26 and other earlier downloads
retain their bundled Run behavior.

Open a student folder containing `zero.json`, or the kit with its
`student-template/zero.json`. The extension uses supported VS Code sidebar,
webview, task and command APIs. VS Code’s native Explorer owns file browsing, selection,
active-editor tracking and file operations. The Zero controls view lives in Explorer;
drag its heading above the file tree once if needed. VS Code remembers the layout.
No separate Zero activity-bar container or custom file tree remains. Idle status is empty. After GitHub
sign-in, the project menu shows the folder or owner/repository on up to two lines,
without a duplicate username row, with a right chevron indicating the menu. Choose **GitHub account…** inside it
for native account controls. Tutorials
and Setup help are in its native overflow menu.

Import the settings-only Zero profile first, then install the local
**zero-0.5.43.vsix**, `redhat.java` and `vscjava.vscode-java-debug` in that profile.
The extension ID is **zero.zero**. **Zero: Show Sidebar** reveals the sidebar
when the activity bar is hidden; a marked workspace reveals it on first activation.

The sidebar’s single **Run**/**Stop** button saves files and runs the project’s
Maven wrapper with `clean compile javafx:run`, opening the app in its own native
JavaFX window. Local Run does not invoke browser compatibility checks or WebFX.
Students need a supported
JDK **17+**, with no global Maven or Node.js installation. The first build needs
internet for Maven and JavaFX dependency downloads; later runs reuse the local
cache.

Tutorial repositories open their first online lesson beside `Main.java` in VS Code's
integrated browser when available. **Tutorial docs** in Zero's menu or Command
Palette opens the website; older hosts fall back to the regular browser. An internet
connection is needed to read the current lessons.

The default build shortcut uses the same native run action:

```json
{"version":"2.0.0","tasks":[{"type":"zero","task":"run","label":"Zero: Run App","group":{"kind":"build","isDefault":true},"problemMatcher":"$zero-java"}]}
```

Click **Stop**, then **Run** after edits to rebuild and restart. The palette’s
Run App command can still restart directly. **Stopping…** stays disabled until
owned work settles; failures and closing the JavaFX window restore **Run**.
Stop cancels the owned build or app process. Build/source errors appear in the
task terminal and Problems; **Show Problems** opens the source diagnostics. Repair a
failed download or the indicated code, then Run App again. A failed build does
not reopen old output as a successful new run.

**Publish & open app** performs browser compatibility checks and production compilation
before the guarded publication flow. Advanced **Export for web** performs the
same browser checks for manual publishing preparation and offers **Preview export**.
Its local URL is not a public link. Native success does not establish browser
compatibility. The existing `zero.runNativeApp` command remains a compatible
alias for native Run. Windows native tasks
use the task shell with strong wrapper-path quoting; other platforms use a
process task. Physical Windows/Linux behavior remains unverified.

**New asset…**, in the **New ▾** dropdown, copies selected images/audio into `src/main/resources`, preserving
originals and existing assets with **Keep both** or **Skip existing**. Copy resource
string literals with **Copy asset paths** in the same menu. **Project menu → Review or
restore changes…** opens native changes or
previews an earlier tracked file version as an undoable edit. Save/test and Commit
& push a correction; history is preserved. VS Code's auto-save preference applies.

**ZeroHub → Share project** guides game details, Commit & push and optional Publish app
before the reviewed GitHub form. Cancel preserves saved details. Submit the form
on GitHub; opening it does not mean gallery acceptance. Each handoff rechecks
account, repository and exact uploaded source; workflow scope expansion hints the
selected native account and still rejects an account change.

Commands: `zero.importAssets`, `zero.copyImportedAssetPaths`, `zero.recovery`,
`zero.runApp`, `zero.runNativeApp`, `zero.stopApp`, `zero.exportWeb`,
`zero.publishWeb`, `zero.copyPublishedWebLink`, `zero.openPublishedWeb`,
`zero.uploadToGitHub`,
`zero.chooseBranch`, `zero.startChange`, `zero.finishChange`,
`zero.githubAccount`, `zero.chooseRepository`,
`zero.signInToGitHub`, `zero.createRepository`, `zero.connectRepository`,
`zero.copyRepositoryLink`, `zero.showSetup` and
`zero.showSidebar`. Sharing commands include `zero.sharingActions`,
`zero.browseZeroHub`, `zero.browseHub`, `zero.browseGames`, `zero.extractLibrary`, `zero.checkLibrary`,
`zero.shareLibrary`, `zero.shareGame`, `zero.switchLibraryMode` and
`zero.recoverLibraryChange`.

## Repository workflow

When signed out, the GitHub area shows only **Sign in**. Local Run and files
stay available. When signed in, the username opens native account actions and
**Project** (or the current folder / connected `owner/name`) opens project actions.
**Clone from GitHub…** asks for a URL and a location starting at `~/Zero Projects`;
choose another parent folder if needed. Native Git handles clone/authentication.
Current editors open its resulting folder in a new window; older supported editors
retain their native open-after-clone choice. **Open local project…** opens an
existing Zero folder without cloning or moving it. An eligible local project can
**Connect to GitHub…**, which attaches a remote rather than downloading files.
Signing out preserves the open project and its local files/history.
The menu retains publishing and branch actions for connected projects.
**New branch** creates a feature branch after you enter its name; **Merge to main** beside
a feature branch directly merges and pushes it to main. Its account, destination,
source and conflict checks still run.
**Commit & push** proceeds from its commit-message input.
Local Run works without sign-in. Local-practice projects continue to block GitHub
sharing. Native VS Code owns move and hide controls for the Zero controls view.

Sign-in uses VS Code's built-in GitHub authentication provider. It requests
`repo` access, including private repositories, so students can choose Public or
Private on GitHub. VS Code owns the sign-in and storage. Zero silently checks
existing sessions on activation; only an explicit sign-in/account action can
open the native authentication flow. Zero has no password or token form.
Native session removal belongs to VS Code Accounts; Zero listens for session
changes through the [VS Code authentication API](https://code.visualstudio.com/api/references/vscode-api#authentication).

Project menu → Create a repository opens [GitHub's new repository page](https://github.com/new).
Use the same account as Zero and create an empty repository: leave README,
.gitignore and license unselected. Return to Zero and connect its page link.
Connect accepts `https://github.com/owner/repository`, optionally ending in
`.git`. It initializes Git only in the marked standalone project and sets
origin; replacement requires confirmation. Copy the starter outside the kit
if it is nested inside another Git repository. Connecting is local and does
not verify GitHub ownership, existence or permission.

**GitHub actions are live by default; activation never uploads automatically.**
After signing in and connecting your own repository, choose **Commit & push**.
Its message input shows the repository and branch; submitting proceeds directly.
Zero validates and stages the captured changes, commits when needed, pushes and
checks the remote
branch. Ignored files stay local. A failed push may leave a local commit.
Optional workspace setting `"zero.uploadMode": "simulation"` is available for
testing: Upload, Start, Finish and Publish skip saves, Git mutations, authentication
prompts and network actions. Explicit simulation settings are honored. Tutorial
repositories use the ordinary GitHub workflow after their required template clone.
Legacy local-only projects retain their older protection. First Publish briefly
warns that the app and included assets will be public and shows its destination; later explicit Publish actions revalidate and update that approved
site without another destination dialog.

Upload the starting version once on main. For each improvement, start a named
branch from clean committed main, edit/run, upload progress, then review Finish
to merge and upload completed work to main. Start can only fast-forward main
from its remote snapshot. Finish requires a clean change branch and refuses
separate unpublished main history. It merges newer remote main into the change
branch and pauses for Run App and another Finish review. Conflicts remain in
place; native Source Control guides resolution/staging/commit before retrying.
No rebase, force push, reset or automatic abort is performed.

Finish advances local main with guarded SHA checks and non-force pushes the
captured completed SHA, then confirms remote main before returning to it. A
failed push retains the change branch for retry; local main may already have
advanced. After confirmed success, automatic cleanup deletes only the unchanged
local finished branch. A cleanup refusal keeps the branch and the successful
merge outcome, with a concise notice and details in Zero Output. The remote
change branch remains. Shared worktrees and unusual
histories require ordinary Git tools. The repository link for Pika is unchanged;
completed code should be on main.

Live transport receives the captured VS Code session in transient child-process
Git configuration scoped to that exact GitHub HTTPS repository. Zero writes no
credential/config file, changes no global Git credentials, disables hooks and
redirects for these transport processes, and keeps credentials out of process
arguments and displayed errors. An empty temporary hook directory is removed
when the process completes. Native session changes invalidate the review;
session/account/token are rechecked before push, remote confirmation and the
strictly allowed main head queries/SHA-pinned fetches used by Start and Finish.
Local Git inspection and commits receive no native-session credentials.

Live upload requires Git 2.31 or newer for isolated runtime configuration. Zero
checks this before obtaining transport credentials and fails closed on older Git.
Git still needs your name/email identity configured for this student repository.
GitHub sign-in does not configure commit identity. For example, use
`git config --local user.name "Your Name"` and
`git config --local user.email "your GitHub email"` inside your student folder.
Zero leaves that choice to you. Setup help reports local tools and upload mode.

Copy Repository Link returns the clean page URL for separate Pika submission.
Students create their own empty repositories; no GitHub Classroom is involved.
See the bundled `GETTING-STARTED.md` for the beginner workflow.

## Playable publication

Run App and test the intended version, finish and upload it on **main**, then
choose **Publish & open app** in the repository dropdown. Sign in and connect
your own repository to enable it. Live publication requires Git **2.31+**, your
own GitHub account and live upload mode. Simulation exits without saving,
requesting authentication, writing publishing files or making network calls.

First setup shows one short public-visibility warning and the Pages destination,
prepares a small publishing kit, requests native GitHub workflow permission when
needed and uses the Commit & push message input. Publishing continues after the
upload without another confirmation. Workflow authorization must use the same account
as Zero. The app and included assets become public; repository visibility stays
unchanged. Zero publishes the validated local build, while GitHub only deploys
its static output. No Java compilation runs on GitHub.

**Run options → Publish & open app** opens the latest verified publication. It
reuses a current saved build without compiling/uploading, or publishes changes
before opening. It never opens an older page after cancellation, failure or edits
during publishing. Copy the browser address to share the app. Successful actions
do not show popups. **Zero: Open Published App** and **Zero: Copy Playable Link**
recheck the saved publication before opening or copying it. Pending runs survive
editor restarts; choose Publish & open app again to recheck. Operational errors identify
a next action and preserve the previous live page. Pika still receives the
separate source repository link.

**Share project** prepares a separate source contribution. It attaches a playable
receipt only when the saved publication verifies for the exact uploaded commit.
ZeroHub’s **Play latest** opens the student-hosted app; source downloads remain
exact versions. Public checker acceptance and activation are still pending;
public ZeroHub uploads are not open yet. Maintainer details are in
`docs/WEB-EXPORT.md` in the Zero source repository.

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
transport. A Mac teacher trial verified native GitHub sign-in/create/connect/cancel/upload
and copy-link for the earlier upload flow; the new start/finish flow uses injected
local remotes for development verification. Real GitHub start/finish and novice
student pilots remain unverified. Mac editor/process checks
and their limits are recorded
in the bundled `VERIFICATION.md`; physical Windows/Linux checks
remain pending. Review focused changes before classroom adoption.

## ZeroHub libraries

Choose **ZeroHub → Libraries**, or **Zero: Browse Libraries** in the Command Palette. **ZeroHub → Projects** opens shared projects on the website. Signed-in students can use **ZeroHub → Share project** for eligible original projects; advanced library authoring remains under **Zero: Libraries and Games** in the Command Palette. Inspect a component's API/checks at `/hub`, then Add its exact library version. Related classes share a dependency. Update/Revert preserve independent library histories and change only reviewed managed POM blocks using the native undoable editor.

Dirty/drifted POMs, incompatible layouts and source copies that shadow installed classes require correction before editing. No automatic upgrade, Git commit or upload occurs. Use the card's exact Java import and ordinary methods, then Run App.

Library authors use **Extract library** inside their existing game repository, then **Check library** locally. Upload the source normally and choose **Share library** to prepare a GitHub request for the exact committed folder/version. `/hub/share` explains this flow and shows public request results. GitHub supplies the real personal-account identity; local Check does not grant hosted acceptance. Public library activation and physical Windows library flows remain unverified.

## Setup checklist

**Zero: Setup Help** checks the host-process JDK/compiler, project files, current-profile Java extensions and optional Git. Relevant terminal environment overrides leave Run readiness unverified; setup preserves those settings and explains what needs review. Choose a missing extension to install it through VS Code; Java/Git repair opens official installer guidance. Check again after repair, or Run first app to build and confirm the native JavaFX window. No installation or account changes occur just by opening the checklist.

## Create files from the sidebar

Clicking **New ▾** opens a dropdown directly below New with **New class…**, **New file…**,
**New folder…**, **New asset…** and **Copy asset paths** after import. A class-name prompt creates and opens an ordinary public Java
class in `src/main/java`. File/folder actions use native Java source, Resources
or Project files location choices, then a relative name (with `/` for nested
folders). Files open in the normal editor; folders appear in the refreshed tree.
Cancellation makes no changes. Names are portable across Mac/Windows, existing
entries are never replaced, and project/trust/symlink checks precede writes.
These local actions work without GitHub sign-in and share the busy-state guard.
