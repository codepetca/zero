# Native Zero Setup

Zero Setup is a thin native wrapper around the guided setup scripts. The local
0.5.6 Windows development build embeds the complete kit. The preserved local
Mac0.5.5 candidate is Developer ID signed and notarized. Neither is a published
download. Fresh-machine and student flow testing remain outstanding.

## Student flow

The setup window stays small and fixed in size. It shows a progress indicator and one
short status message, replacing the previous message as each step changes.
Technical output is available only through **Details** in a separate window.
There is no checklist, scrolling log or Terminal menu in the native flow.

Setup checks existing tools before proposing changes. Choose a fresh writable
kit folder; existing folders are never replaced. It handles one required item at
a time, asks before installation or an external handoff, and checks the result
before advancing. Compatible tools and existing profiles are reused. Git is
optional for local running; GitHub and Pika remain separate.

When setup needs a vendor installer or an editor action, it explains that step
before opening the relevant application. System approval prompts remain visible;
setup never enters passwords, silently elevates or installs a package manager.
An unavailable or failed action leaves a clear retry/help state instead of
claiming success. **Open Zero** is offered after required readiness checks pass;
opening the editor is not proof that the first app runs. In Zero, use Run App
and confirm the greeting window.

Supported background work includes tool checks, kit copying and approved extension
installation into an existing Zero profile. VS Code's supported CLI cannot create
or import that profile quietly: if it is absent, the main window guides its import
one short instruction at a time. A **Copy profile path** button helps select the
bundled file; **Check profile** verifies the result before continuing. Required
instructions never depend on Details. Compatible existing profiles are preserved.
Missing or incompatible VS Code and Java use explicit official-download handoffs
with normal system approval. Native setup uses vendor handoffs for tools. Fully quit and
reopen VS Code after changing Java or its environment, then check again.

The extracted kit's shell launchers stay available as a manual fallback. Physical
Windows testing remains deferred; cross-builds and fake tests do not prove its UI.
Cancellation/failure preserves existing work; owned partial staging is cleaned
up. Close/quit waits for the current owned operation to finish. Forced termination
can still leave owned staging, never permission to replace an existing project.

## Local build

`npm run package:installers` rebuilds/verifies the canonical kit and creates
`dist/installers/Zero-Setup-0.5.6-macos-development.dmg` and
`dist/installers/Zero-Setup-0.5.6-windows-development.exe`. The measured
`build-all.json` records exact payload/artifact hashes and source revision.
Platform-only commands are in [DEVELOPMENT.md](DEVELOPMENT.md).

The calmer 0.5.5 Mac candidate passed signing, notarization, artifact verification
and a read-only existing-Mac check/copy smoke test. See VERIFICATION.md for exact
source/hashes and untested flows. The prior signed/notarized 0.5.4
DMG and receipt are preserved under `.verification/mac-signing/preserved-0.5.4/`;
its verification does not cover changed setup behavior.
The Windows candidate is unsigned and needs an actual Windows trial. To build
only Windows after kit packaging/verification:

```sh
node scripts/build-installers.mjs --platform windows
node scripts/verify-installers.mjs --platform windows
```

The signed Mac0.5.5 kit/receipt are preserved under
`.verification/calm-windows-setup/preserved-mac-0.5.5/`; this Windows work does not
regenerate or re-sign it. To rebuild/check a new unsigned Mac candidate:

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
not a secret). A new signed candidate would be `Zero-Setup-0.5.6-macos.dmg`, measured in
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
macOS calls `/bin/bash .../setup.sh --native-check`; Windows calls native PowerShell
`-NoProfile -NonInteractive -File .../Setup.ps1 -NativeCheck` under normal policy.
Both invoke fixed background actions from the copied kit. Windows uses normal-policy
`-File` for native actions. If policy blocks it,
read the copied Setup.cmd guidance; managed policy remains authoritative.

No new package manager, persistent agent or custom IDE engine is introduced.
Compatible VS Code policy comes from canonical extension metadata. Manual shell
scripts retain their explicit Homebrew/winget install-versus-update prompts; the
native flows approve editor extension installation in their own window.
The wrapper does not download and execute its own unverified installers. Unknown versions,
broken JAVA_HOME, unmanaged tools and failed repairs remain visible.

## Verification and distribution limits

The prior 0.5.4 candidate passed Developer ID signing, Apple notarization, staple
validation and Gatekeeper CLI assessments. Its local existing-Mac smoke test
passed native checks, folder protection/copy and JavaFX runtime. New 0.5.5 source
and artifacts passed their own source-bound checks; prior receipts do not cover
them. Real missing-tool installation and first-time profile import remain untested.

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
repairs, native profile-import/trust or first-open security prompts, SmartScreen,
restricted school networks or novice usability. Terminal GUI access was blocked
by the computer-control tool; the copied guided menu was tested through an
isolated PTY. See [VERIFICATION.md](VERIFICATION.md) for evidence and limits.

## Maintainer harnesses

For safe macOS interactive visual checks, run the compiled harness with
`--interactive-preview --scenario extensions` (also `tools`, `profile`, `ready`,
`failure`). This uses disposable kits and fake commands exclusively; it is not
real installation evidence. It never installs tools or edits host profiles.

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
