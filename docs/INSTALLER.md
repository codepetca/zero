# Native Zero Setup

Zero Setup uses a native Mac runtime; Windows wraps the guided setup scripts. Signed,
notarized Mac0.5.14 is published at [setup-v0.5.14](https://github.com/codepetca/zero/releases/tag/setup-v0.5.14)
and embeds the complete0.5.14 kit. Windows development installers remain local
and unsigned; they are excluded from student downloads. Previous Mac releases
are preserved.
The website offers Mac setup alongside the separately verified published kit ZIP.
The independent native manifest and exact-byte sealing/publication procedure
are documented in [RELEASING.md](RELEASING.md).
An isolated Mac trial passed verified vendor assets, automatic editor support,
Open, Run/Stop, autosave and the standard build command. Fresh-machine tool installation and novice usability remain untested.

## Student flow

Published Mac0.5.14 packages **Zero.app** with an **Applications** shortcut
and a centered arrow layout on its DMG. Earlier releases retain their original
apps and immutable bytes.

1. Open the DMG and drag **Zero.app** into **Applications**.
2. Open **Zero** from Applications. On first launch it shows **Preparing Zero…**
   with a progress bar below the text, prepares Java/editor support and `~/Zero`, and opens the
   configured VS Code editor automatically.
3. In the editor, review workspace trust if asked and choose **Run App**.

Dragging copies the application only. Java/editor preparation happens when Zero
is opened for the first time; later openings verify and reuse the existing setup.

The app stays in Applications as the launcher. Once VS Code opens, the preparation
window closes. Eject the DMG after copying the app. Later launches compare only
installer-owned files, verify readiness and restore the saved Zero editor session
without copying or creating backups. Changed/older installer files use the guarded
setup-only update, preserving the entire student project. Missing editor support
is repaired once; failure retains Try again and Details rather than looping.

Details is hidden during healthy preparation. The bar advances with completed
stages and fills only after final readiness; it does not estimate download/time
percentages. Opening retains a fresh backend check. First launch selects the
starter; reopening lets VS Code restore its own isolated saved UI/workspace state.
Git/GitHub and the first student app run remain separate choices. Windows and
ZIP/manual launchers keep their existing guided flow and animated progress bar.

Mac setup uses a private JDK21 and isolated VS Code user-data/extensions under
`~/Library/Application Support/Zero`. It reuses a compatible installed VS Code,
or installs a verified copy for Zero in that private directory. Downloads are
pinned by URL and SHA256 in `setup/mac-downloads.json`; changed bytes are refused.
Normal system Java, VS Code profiles and student source are preserved. Initial
quiet settings are copied only when Zero's settings file is absent; later theme
and editor choices are kept. This editor configuration is separate from a named
Zero profile in an ordinary VS Code window. Open **Zero** in Applications to return to the configured editor.
**Open Zero.command** remains an optional manual fallback.

The Mac native runtime is compiled into the app: students need no Python, Node,
Homebrew or compiler to install. The installer does not enter passwords, elevate,
change global environment variables, disable security prompts or enroll a device.
Workspace trust and managed-device restrictions still apply. First-time Maven
and JavaFX downloads occur when Run App builds the project.

Windows native setup and ZIP/manual launchers retain their guided profile import
and official-download handoffs. Compatible tools and existing profiles are reused.
Physical Windows testing remains deferred. These platform paths are not described
as having the new Mac automation.

The extracted kit's shell launchers stay available as a manual fallback. Physical
Windows testing remains deferred; cross-builds and fake tests do not prove its UI.
Cancellation/failure preserves existing work; owned partial staging is cleaned
up. Close/quit waits for the current owned operation to finish. Forced termination
can still leave owned staging, never permission to replace an existing project.

## Default location

Native setup source uses only `~/Zero` on macOS and
`%USERPROFILE%\Zero` on Windows. There is no location or name picker and no
numbered replacement folder. Opening the current native setup starts preparation.

When that folder already contains a recognizable Zero kit, setup refreshes its
installer files automatically. Files, links and unrelated folders named Zero are
refused rather than overwritten; resolve that conflict manually before retrying.

An update refreshes only the bundled setup launchers/scripts, setup metadata,
top-level guide/license and the current version’s Zero VSIX. Replaced setup files
are backed up beside the Zero folder in `.zero-setup-backup-<id>`; the location
is recorded in diagnostics and available through Details if setup fails. The entire `starter/` project,
including source, framework copies, build files, editor settings, Git history,
assets and saves, remains unchanged. Existing `optional/` profile/keybinding files,
other files and older VSIXs remain unchanged too. Updating setup does not migrate
an existing student app to a new Java API or project build configuration.

An access/copy failure offers Details and retry. Fix home folder access (or ask
for help) before retrying; setup never silently falls back to another location.

Mac0.5.7 delivers the default-folder and automatic editor/Java flow. Previous
Mac0.5.6 downloads retain their original picker and manual guidance. Windows
source is tested with fakes/cross-builds only; no new Windows installer is published.
ZIP launchers keep their current manual behavior.

## Local build

`npm run package:installers` rebuilds/verifies the canonical kit and creates
`dist/installers/Zero-0.5.14-macos-development.dmg` and
`dist/installers/Zero-Setup-0.5.14-windows-development.exe`. The measured
`build-all.json` records exact payload/artifact hashes and source revision.
Platform-only commands are in [DEVELOPMENT.md](DEVELOPMENT.md).

The calmer 0.5.5 Mac candidate passed signing, notarization, artifact verification
and a read-only existing-Mac check/copy smoke test. See VERIFICATION.md for exact
source/hashes and untested flows. The prior signed/notarized 0.5.4
DMG and receipt are preserved under `.verification/mac-signing/preserved-0.5.4/`;
its verification does not cover changed setup behavior. The 0.5.6 Mac candidate
has its own accepted notarization and full artifact checks, with unchanged Mac
runtime source. Its isolated Mac profile/extension/Open/Run/Stop trial passed;
see VERIFICATION.md for the remaining platform and fresh-machine limits.
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
not a secret). A new signed candidate would be `Zero-0.5.14-macos.dmg`, measured in
`build-macos-signed.json`. The development filename and receipt stay separate.
The current app bundle identifier is `ca.codepet.zero`; releases through0.5.12
retain `ca.codepet.zero.setup`. Its explicit plist marker
removes unsigned-development labels and shows only Zero/version. Signed
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
macOS calls its compiled native runtime helper; Windows calls native PowerShell
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
  -F .verification/sparkle-2.10.0 -framework Sparkle \
  -Xlinker -rpath -Xlinker "$PWD/.verification/sparkle-2.10.0" \
  native-installer/macos/SetupCore.swift native-installer/macos/MacRuntime.swift \
  native-installer/macos/SetupWindow.swift \
  native-installer/macos/UpdateCoordinator.swift \
  native-installer/macos/tests.swift \
  -o .verification/native-installer/macos/setup-tests
.verification/native-installer/macos/setup-tests \
  --preview .verification/native-installer/macos/preview.png
```

The framework directory above is the digest-verified Sparkle distribution from
the native build's dependency acquisition; do not substitute an unverified
framework. `npm run test:updates` covers strict dependency, feed, signature,
version and build-receipt contracts. The separate, explicitly invoked
`npm run test:updates:live -- --developer-id-live` creates disposable Developer ID signed/notarized
fixture apps and an ephemeral fixture key. It uses the existing Zero Notarization
profile, loopback transport and a separate test identity, never installed Zero or
student data. It is not part of routine unit tests.

## Mac automatic updater

New native versions from0.5.15 embed pinned Sparkle2.10.0. Existing0.5.14 and
earlier downloads retain their original bytes and need one manual replacement
to gain automatic updating. The launcher opens the configured editor first,
then performs a due background update check. A prepared update replaces only
Zero.app after Zero's setup helpers finish; the editor is not terminated.
Owned kit support files prepare on the next launch, preserving student work.
An already-running editor may need a student-chosen reload to activate a newly
installed Zero extension.

`release/mac-updater.json` contains only public trust/dependency configuration
and the strictly increasing native build number. Production enables signed feeds
and verifies archives before extraction; unsigned development builds omit the
production feed, public key and URL registration. Runtime helper invocations do
not initialize the updater. Never enable the fixture compile flag in production.
See [the implementation plan](AUTO-UPDATES-PLAN.md) for lifecycle and recovery.

Manual Check for Updates and Update Settings are in the Mac app menu and the
macOS VS Code Command Palette. Requests select only those fixed actions. A slow
background check has a120-second unattended-work budget; visible interaction
and committed installation have separate completion rules. Updates retry on a
later Zero launch when offline. School-managed/non-writable apps can still need
administrator authorization. Checks do not run while only VS Code is open.

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

Published0.5.14 adds a centered Finder layout with only Zero and Applications
icons/labels and an arrow. Preparation text and progress below form a centered
group. Mac0.5.13 retains its original plain DMG. Finder chrome may follow user
preferences; the installer does not change them.
