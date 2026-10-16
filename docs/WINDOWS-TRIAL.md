# Windows release trial

Use a fresh **Windows 11 x64** VM or disposable ordinary account with internet,
no existing Zero installation and no valuable student work. Take a VM snapshot.
Do not sign in to GitHub or change account credentials. An optional second trial
on an IT-approved school machine records policy/antivirus restrictions; it does
not bypass them. Windows 10, ARM, 32-bit and school deployment remain separate
coverage until actually tested.

The unsigned development candidate can be tried now: install/open, private Java
and editor preparation, real JavaFX windows, cached offline rebuilding, saved
project reopening and interrupted-setup retry do not require a signing account.
The smoke tests below install/download real software and leave Zero's files in
the disposable account. Authenticode, SmartScreen trusted-publisher behavior and
signed A→B updating stay **pending** until reviewed signed candidates exist.
Do not mark `nativeWindowsTested:true` from automated receipts alone.

## Automated disposable-account smoke

Build from the reviewed checkout with the pinned tools as documented in
[WINDOWS-INSTALLER.md](WINDOWS-INSTALLER.md). Copy the measured development Setup
EXE and `build-windows.json` together to the test machine. Keep this script from
the same reviewed checkout. From Windows PowerShell 5.1, run:

```powershell
& .\scripts\test-windows-installation.ps1 -DisposableAccount `
  -BuildReceipt C:\Trial\build-windows.json `
  -OutputDirectory C:\Trial\installation-result
```

The output directory must be new. Existing `%LOCALAPPDATA%\Zero`, `ZeroData`,
`%USERPROFILE%\Zero` or the Zero Start-menu shortcut cause refusal before install.
Use an interactive desktop if the host cannot create/close editor windows.

The script verifies Setup's measured size/hash, runs its bounded silent install,
checks the installed launcher/version/layout and Start-menu shortcut, then opens
the real stable launcher stub. It waits up to 15 minutes for real Java/editor and
extension preparation and the isolated editor process, executes private Java and
javac, checks the installed Zero/Java extensions and starter, closes the isolated
editor gracefully, and reopens from Start. Cleanup stops only identified trial
launcher/editor processes and their recorded descendants. Files stay available
for diagnosis; discard the VM/account when finished. A timeout or unavailable
GUI/network is a failed trial requiring inspection, never a silent skip.

After that script passes, run its companion from the same reviewed checkout with
**Node.js 22+**. Node is needed only for this maintainer/CI automation; students
need neither Node nor global Maven. Keep the same measured Setup EXE/build receipt
available:

```powershell
node .\scripts\test-windows-javafx.mjs --disposable-account `
  --installation-receipt C:\Trial\installation-result\report.json `
  --build-receipt C:\Trial\build-windows.json `
  --output "C:\Trial\JavaFX result"
```

The output directory must be new and its parent must exist. The companion checks
the passing installation receipt against the candidate's measured bytes/version,
requires the isolated editor's exact pinned private Java root, and copies the
installed starter into `installed starter with spaces` under that output. The
original starter remains available for interactive Run App. The copied wrapper,
Maven distribution and build pins must match the reviewed checkout.

It uses the pinned wrapper with explicit private JAVA_HOME/PATH and output-local
Maven settings, repository, wrapper cache and temporary files. The first online
`clean compile javafx:run` warms all needed plugins, including clean. A disposable
ordinary Java class extends `zero.App`, opens a real JavaFX Stage, updates a Label,
calls show, checks its displayed state, closes automatically and writes a unique
marker. A second `-o clean compile javafx:run` deletes compiled outputs, rebuilds
and repeats the window using cached JavaFX/native dependencies. This proves Maven
offline cache use; it does not disconnect Windows or prove the editor's Run App
command offline. Each run has a deadline and scoped process-tree cleanup, with
private bounded Maven logs and a small `report.json`. GUI, network and timeout
failures fail the trial. Discard the disposable VM/account afterward.

[Windows CI](../.github/workflows/windows-native.yml) runs both scripts after
fixtures and packaging on a disposable `windows-2022` GitHub-hosted runner. Their
results establish only that runner's automated smoke coverage once executed.
Configuring the workflow is not evidence that a remote run passed. No signing
key, certificate, secrets or production feed are used. The development updater
is disabled; RSA/update state-machine fixtures are a separate CI step.

## Owner acceptance on an interactive desktop

Use a new VM snapshot/account for each candidate. Record date, Windows build,
CPU architecture, ordinary/admin context, display scale, candidate version and
Setup SHA-256. Record existing VS Code and any deliberately bad JAVA_HOME only
in their separate coverage cases. Check each result as pass/fail/pending:

- For the unsigned development trial, transfer the measured development candidate
  and receipt to the disposable machine and verify its hash. Record its unsigned
  status and actual warnings/antivirus behavior; inspect or stop when policy blocks
  it. Do not globally disable protections. Open the installer normally and verify
  no unexpected administrator prompt. This is useful install evidence, with signed
  publisher and SmartScreen acceptance still pending.
- Allow **Preparing Zero…** to finish. Confirm the editor opens, Zero's sidebar
  appears and the starter is readable ordinary Java. Trust only this expected
  workspace when prompted. Choose **Run App**, wait for Maven/JavaFX preparation,
  interact with the app, edit a visible value, Run again, then Stop. Capture any
  useful error under Details/Problems.
- Close the editor, reopen **Zero** from Start and confirm the saved project
  returns. Open a second project and repeat to verify saved-session restoration.
  Check keyboard navigation, high DPI and Narrator on the setup/error UI.
- After one successful Run, disconnect the network and reopen Zero. Confirm
  existing support and the previously built app still work. Reconnect. On a
  separate fresh snapshot test interrupted first preparation, close/cancel and
  **Try again**; no permanent background helper should remain after it settles.
- Once signing is available, repeat installation with the **production signed
  candidate** from the intended trial source. Check its actual Authenticode
  publisher, timestamp and measured hash. Record SmartScreen/antivirus behavior
  and whether the expected trusted publisher appears. An unsigned trial cannot
  satisfy this acceptance item.
- With installed **signed version A**, keep the isolated editor open, an unsaved
  buffer and a JavaFX app running. Use the reviewed, authenticated HTTPS feed
  offering **higher signed version B** with immutable measured package bytes.
  Exercise automatic updating and a separate **Zero: Check for Updates** run.
  Confirm launcher replacement completes within its budget, editor/Java app
  processes and unsaved contents survive, and the next Start launch runs B.
  Record launcher version, installed extension version and active extension
  version separately; choose a reload if offered. Test update preferences and
  manual checking while automatic checks are off.
- During a separate A→B attempt, disconnect/reconnect or offer the agreed invalid
  signed/hash fixture through the authorized trial feed. A stays usable; no
  unauthenticated package is applied and retry is useful. Do not alter the public
  feed for a test. A local file copy or unsigned development reinstall does not
  count as the signed update test.

The signed A→B case needs two reviewed signed candidates, an existing authorized
publisher key/certificate and an authorized trial feed. If those are unavailable,
mark it **pending**. Provisioning keys, signing, publishing or changing accounts
requires the owner's separate applicable authority. Do not manufacture a passing
result or promote the public Windows download while a release gate is pending.

Prepare A and B from a dedicated reviewed trial branch with
`release/windows-updater.json` pointing to an owned HTTPS staging-feed URL before
building either installer. Use a separate trial signing key for the feed, and keep
the staging configuration/key out of the production release branch. Both builds
must trust that trial public key and use the same staging URL; advance the kit and
extension version for B. Publish exact measured signed B bytes and their signed
descriptor to the authorized trial endpoint. A production build's embedded stable
feed URL cannot be redirected using a runtime flag. Do not modify the public
stable feed to conduct this test.

## Return the evidence

Return both small automated `report.json` files, a completed checklist with exact
candidate hashes/versions and concise errors or screenshots. Keep `setup.log`
and `online-maven.log`/`offline-maven.log` and editor/native error Details private until reviewed for account paths or other
personal data. Redact user names, student work, repository URLs and secrets before
sharing. Do not upload whole editor user-data/extensions directories, credentials,
GitHub tokens, private keys, certificates or account databases. A useful failure
report says which step failed, what the student saw and whether retry succeeded.
