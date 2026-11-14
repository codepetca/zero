# Zero Portable for Windows

Pilot for one school desktop running x64 Windows 10 (build 19041 or later) or
Windows 11 with .NET Framework 4.8. A regular student can start it by opening
**Zero.exe** in the approved local folder. The launcher is unsigned. School IT
can use the accompanying SHA-256 checksum and the application's normal approval
process.

## Prepare the public ZIP

1. Extract the entire ZIP to a short path on an internet-connected staging PC.
2. In the extracted **Zero Portable** folder, open Windows PowerShell and run
   `.\Stage-Tools.ps1`. It downloads and verifies the pinned VS Code, Temurin JDK,
   Node.js, MinGit, and universal Java extension from their vendors. If IT has
   already downloaded the exact files listed in `BUILD.json` and the staging
   script, use `.\Stage-Tools.ps1 -DownloadDirectory 'C:\Downloads\Zero tools'`.
3. Have school IT approve the unsigned launcher and copy the complete staged
   folder to the approved local path. Grant students read and execute access.
   Allow about 2 GB for the staged folder and additional space during staging.

## Prepare the private ZIP

1. Extract the entire pilot ZIP to a short path on a staging Windows PC.
2. In the extracted **Zero Portable** folder, run **Stage-VSCode.ps1** using
   Windows PowerShell with `.\Stage-VSCode.ps1`. This fetches the pinned official VS Code ZIP from
   Microsoft, checks its SHA-256, and adds it to `tools\vscode`. For a previously
   downloaded copy of that exact archive, use
   `.\Stage-VSCode.ps1 -EditorZip 'C:\Downloads\VSCode-win32-x64-1.142.0.zip'`.
   `BUILD.json` has the direct Microsoft URL, version, and hash.
3. Have school IT copy the complete staged **Zero Portable** folder to the
   approved local path, with students granted read and execute access. Keep
   the folder writable only by the people who manage the deployment. Allow
   about 2 GB for the staged folder. Keep all the subfolders together.

If Windows PowerShell scripts are restricted on the staging PC, IT can verify
the official VS Code ZIP against `BUILD.json`, extract it so that
`tools\vscode\Code.exe` exists, and save the lowercase SHA-256 as plain ASCII
text in `tools\vscode\.zero-asset.sha256`. The VS Code ZIP should have no
`data` folder beside `Code.exe`. The Zero launcher supplies each Windows login
with separate settings, extensions, and sign-in state.

The folder contains the Zero launcher, Temurin JDK, Node.js, MinGit, and
universal Java editor extension. Obtain VS Code from Microsoft.
[VS Code Windows ZIP](https://code.visualstudio.com/docs/setup/portable)
· [Microsoft VS Code license](https://code.visualstudio.com/license)

## Test with a student login

1. Sign in to Windows as a regular student. Open **Zero.exe**. Wait for the
   editor. On the first launch, complete **Sign in to Zero** in the browser
   using a school-approved test GitHub account. The pilot keeps the regular
   Zero sign-in requirement for running projects.
2. Use **Zero: Troubleshooting → Test installation** from the Command Palette.
   If asked, trust only the Zero starter project you recognize. Choose **Run test**
   and confirm the JavaFX window opens. Choose **Stop** and run it a
   second time. The first build needs access to Maven Central for Maven and
   JavaFX.
3. Close the editor and open **Zero.exe** again. Confirm the isolated editor
   reopens and can run the starter again. If a second test account is
   available, confirm it opens without the first user's saved projects or
   GitHub session.
4. To test the full classroom flow, finish connecting GitHub if Zero asks.
   Create a project, run it, and test uploading and publishing to GitHub Pages
   with a disposable repository.

Student settings and extensions live in `%LOCALAPPDATA%\ZeroPortableData`.
The installation test uses the writable starter in
`%USERPROFILE%\Zero Portable`. Save new projects in
your usual approved workspace. This package has no launcher, editor, or
extension auto-updates. IT can replace the staged folder when testing a newer
approved package.

If something is blocked, record whether it happened while starting Zero,
opening the editor, running Java, or signing in. Use **Details** in the launcher
or the **Run App** task terminal to get the error. The school may apply separate
rules to the launcher's DLLs, executables in subfolders, the project
`mvnw.cmd` and Windows PowerShell, and JavaFX DLLs loaded from a user cache.
The browser build also runs the project's JavaScript builder in a temporary
folder. App and network policy must permit the workflow on the target account.
[Microsoft AppLocker rule collections](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/working-with-applocker-rules)

## Rebuild the local pilot

Build and verify a new local kit with `npm run package` and `npm run verify:kit`.
Put the pinned vendor archives from `setup/windows-downloads.json` in a
download folder as `jdk.zip`, `git.zip`, and `node.zip`. Save the pinned
[universal Java VSIX](https://github.com/redhat-developer/vscode-java/releases/download/v1.57.0/vscode-java-1.57.0-1110.vsix)
as `java.vsix` in the same folder. Run
`node scripts/build-windows-portable.mjs DOWNLOAD_DIRECTORY NEW_OUTPUT_DIRECTORY`
with .NET SDK and Python 3.11+ available. The output contains the measured ZIP
and its checksum. The build uses locked dependencies and includes the exact
verified kit in the Windows launcher.
