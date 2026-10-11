# Native Zero Setup

Zero Setup is a thin native wrapper around the guided setup scripts. The local
0.5.4 development builds embed the complete kit; they are not published downloads
and are not ready for classroom distribution until platform testing and signing.

## Student flow

1. Open Zero Setup and choose **Check laptop**. Read selected tool versions/paths
   and any missing or incompatible items. Checks do not install anything.
2. Choose **Set up Zero**, select a writable parent folder, and give a fresh folder
   name. The complete kit is copied there. Existing folders are never replaced,
   including when a folder appears during copying.
3. Choose **Continue setup**. The existing guided setup opens in a terminal and
   offers explicit tool repair, profile and extension actions. Keep compatible
   tools. Use official manual repair when a package manager cannot manage them.
4. Open the copied starter in Zero, run the first app and confirm its window.
   Git is optional for local running. GitHub sign-in/repository creation and Pika
   link submission are separate.

The app also offers **Show guide** and **Open folder**. The kit is placed in a
student folder, not inside a read-only DMG or Program Files. No setup is performed
as root. Cancellation/failure preserves existing work; partial staging is cleaned
up. Normal close/quit waits until the current check or copy has finished; a check
has a bounded timeout. Forced process termination can still leave an owned hidden
staging folder; it never authorizes replacing an existing project. Recheck after
repairs and restart when environment changes require it.

## Local build

`npm run package:installers` rebuilds/verifies the canonical kit and creates
`dist/installers/Zero-Setup-0.5.4-macos-development.dmg` and
`dist/installers/Zero-Setup-0.5.4-windows-development.exe`. The measured
`build-all.json` records exact payload/artifact hashes and source revision.
Platform-only commands are in [DEVELOPMENT.md](DEVELOPMENT.md).

The current Mac-first pass uses the reviewed4b7058c source and
`dist/installers/build-macos.json`; the earlier all-platform receipt is historical
and archived under `.verification/native-installer/build-all-b3551be.json`.
Windows testing is explicitly deferred. To rebuild/check only Mac:

```sh
node scripts/build-installers.mjs --platform macos
node scripts/verify-installers.mjs --platform macos
```

A separately authorized Mac signing build accepts only an explicit 40-hex SHA1
certificate identity; it does not discover identities or change Keychain access:

```sh
node scripts/build-installers.mjs --platform macos --sign-identity <40-hex-SHA1>
node scripts/verify-installers.mjs --platform macos --signed
```

Replace the placeholder with the authorized certificate SHA1 (a public identifier,
not a secret). The signed candidate is `Zero-Setup-0.5.4-macos.dmg`, measured in
`build-macos-signed.json`. The development filename and receipt stay separate.
The app bundle identifier is `ca.codepet.zero.setup`; its explicit plist marker
removes unsigned-development labels and shows only Zero Setup/version. Signed
mode requires macOS and explicit `--platform macos`; Windows remains deferred.

The builder signs the owned universal app with hardened runtime and a secure
timestamp, without entitlements or recursive signing, verifies its Developer ID
signature, then creates, signs and verifies the DMG. The receipt records actual
certificate SHA1/team/authority and signature evidence from both architecture
signatures and the DMG. Signing leaves `notarized:false`; no notarization upload,
authentication or publication is automated. Existing kit bytes are reused.

After separately authorized notarization and DMG stapling, update the signed
receipt with the exact stapled DMG size/SHA256 and verified notarization evidence
before setting `notarized:true`. Signed verification checks artifact hashes,
version/bundle identity, both architectures, every kit byte/mode and the actual
Developer ID signatures against the receipt. For `notarized:true`, it also requires
DMG staple validation and successful Gatekeeper DMG/app assessments. These
checks do not establish classroom runtime, fresh-machine or physical Intel tests.

The macOS app uses AppKit and Foundation, targets macOS 12+, and includes ARM64
and Intel binaries. The Windows app uses Windows Forms and the Windows .NET
Framework 4.8; the .NET SDK/reference package is build-only. Recent Windows 10/11
include a compatible framework; see [Microsoft's Windows version table](https://learn.microsoft.com/en-us/dotnet/framework/install/on-windows-and-server).
Older systems may need Microsoft's runtime installation.
The Windows EXE embeds the ZIP, validates/extracts it into an owned temporary
folder, and copies it atomically into the chosen fresh folder. The macOS app
carries the kit in Contents/Resources/kit and preserves executable script modes.

Native checks have bounded output/time and use fixed executables/arguments.
macOS calls `/bin/bash .../setup.sh --check`; Windows calls native PowerShell
`-NoProfile -NonInteractive -File .../Setup.ps1 -Check` under normal policy.
Continue opens the copied launcher explicitly. Windows uses normal-policy
`-File`, never an automatic execution-policy exception. If policy blocks it,
read the copied Setup.cmd guidance; managed policy remains authoritative.

No new package manager, persistent agent or custom IDE engine is introduced.
Compatible VS Code policy comes from canonical extension metadata. Shell scripts
retain their explicit Homebrew/winget install-versus-update prompts; the wrapper
does not download and execute its own unverified installers. Unknown versions,
broken JAVA_HOME, unmanaged tools and failed repairs remain visible.

## Verification and distribution limits

Default development packages lack Developer ID/notarization or Authenticode signing.
A compiler's ad-hoc Mach-O signature is not a distribution identity. Do not guide
students to disable security controls. Signing account access and publication
need separate owner authorization.

Harnesses use disposable files and fake probe/launch interfaces. The Mac-first
pass also checked the real AppKit check/picker/copy flow and installed Zero/Java
extensions in isolated VS Code test directories. Real editor Run/autosave/default
build/Stop opened the starter JavaFX window with a disposable stage probe. Existing
student/teacher profiles, tools and accounts were preserved; no package-manager
installation or authentication was attempted.

These checks do not prove physical Windows UI, Intel execution, clean-machine
repairs, native Terminal/profile-import/trust prompts, Gatekeeper/SmartScreen,
restricted school networks or novice usability. Terminal GUI access was blocked
by the computer-control tool; the copied guided menu was tested through an
isolated PTY. See [VERIFICATION.md](VERIFICATION.md) for evidence and limits.

## Maintainer harnesses

On macOS, compile and run against disposable files/fake commands:

```sh
mkdir -p .verification/native-installer/macos
xcrun swiftc -O -target arm64-apple-macosx12.0 -D ZERO_SETUP_TESTS \
  -parse-as-library -framework AppKit -framework Foundation \
  native-installer/macos/SetupCore.swift native-installer/macos/SetupWindow.swift \
  native-installer/macos/tests.swift \
  -o .verification/native-installer/macos/setup-tests
.verification/native-installer/macos/setup-tests \
  --preview .verification/native-installer/macos/preview.png
```

For the Windows backend, build the net48 harness then run it with Mono on macOS,
or directly on Windows. Use separate ignored intermediate/output folders:

```sh
dotnet build native-installer/windows/tests/WindowsHarness.csproj -c Release \
  -o "$PWD/.verification/native-installer/windows-tests" \
  -p:BaseIntermediateOutputPath="$PWD/.verification/native-installer/test-obj/" \
  -p:BaseOutputPath="$PWD/.verification/native-installer/test-bin/" \
  -p:RestorePackagesPath="$PWD/.verification/native-installer/nuget"
mono .verification/native-installer/windows-tests/WindowsHarness.exe dist/zero-bootstrap.zip
npm run test:installers
npm run verify:installers
```

`verify:installers` verifies the measured artifact hashes, the EXE's exact embedded
ZIP and managed PE header, and mounts the DMG read-only to compare every bundled
file/permission plus both binary architectures. It detaches afterward and never
executes installer actions. DMG inspection requires macOS; use `--platform windows`
with a matching platform-only build receipt to inspect only the Windows EXE.
