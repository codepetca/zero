# Windows release trial

Use a fresh **Windows 11 x64** VM or disposable ordinary account with internet,
no existing Zero installation and no valuable student work. Take a VM snapshot.
Do not sign in to GitHub or change account credentials. An optional second trial
on an IT-approved school machine records policy/antivirus restrictions; it does
not bypass them. Windows 10, ARM, 32-bit and school deployment remain separate
coverage until actually tested.

The development smoke test below installs and downloads real software. It leaves
Zero's installed files in the disposable account. It never proves production
signing, SmartScreen acceptance, a JavaFX app run or a signed automatic update.
Do not mark `nativeWindowsTested:true` from the CI receipt alone.

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

[Windows CI](../.github/workflows/windows-native.yml) runs the same script after
fixtures and packaging on a disposable `windows-2022` GitHub-hosted runner. Its
result establishes only that runner's automated smoke coverage once executed.
Configuring the workflow is not evidence that a remote run passed. No signing
key, certificate, secrets or production feed are used. The development updater
is disabled; RSA/update state-machine fixtures are a separate CI step.

## Owner acceptance on an interactive desktop

Use a new VM snapshot/account for each candidate. Record date, Windows build,
CPU architecture, ordinary/admin context, display scale, candidate version and
Setup SHA-256. Record existing VS Code and any deliberately bad JAVA_HOME only
in their separate coverage cases. Check each result as pass/fail/pending:

- Download the **production signed candidate** from the intended trial source.
  Check its Authenticode publisher, timestamp and hash against the signed build
  receipt. Open it normally; record actual SmartScreen/antivirus behavior. Do not
  globally disable protections. Verify no unexpected administrator prompt.
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

Return the small automated `report.json`, a completed checklist with exact
candidate hashes/versions and concise errors or screenshots. Keep `setup.log`
and editor/native error Details private until reviewed for account paths or other
personal data. Redact user names, student work, repository URLs and secrets before
sharing. Do not upload whole editor user-data/extensions directories, credentials,
GitHub tokens, private keys, certificates or account databases. A useful failure
report says which step failed, what the student saw and whether retry succeeded.
