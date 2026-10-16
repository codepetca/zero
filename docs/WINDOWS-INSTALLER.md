# Windows automatic setup and updates

The 0.5.18 source adds a per-user Windows launcher with automatic setup and
authenticated updates. It is a local development candidate. Published Windows
0.5.17 remains the manual complete-kit ZIP until a signed candidate passes actual
Windows acceptance and receives separate publication authorization.

## Student experience

1. Download the signed Windows Setup EXE and open it. The installer adds **Zero**
   to the Start menu and opens it. No administrator or package-manager setup is
   part of the ordinary per-user path.
2. **Preparing Zero…** downloads verified Java and editor support, creates the
   isolated editor settings, installs Zero and Java support, then opens the editor.
   No PowerShell menu, profile import or global Java environment change is needed.
3. Review workspace trust if asked, then choose **Run App**. The first app build
   downloads Maven and JavaFX. Git/GitHub can wait until sharing.
4. Later, open **Zero** from Start or its pinned taskbar shortcut. The editor
   restores its saved Zero session. Required setup repairs happen automatically;
   failures stop with **Try again** and useful **Details**.

Automatic checks run after the editor opens, when due (normally once a day),
with a 120-second background budget. A verified update replaces the launcher
after its setup helpers finish. VS Code and the student Java app remain running;
the new launcher prepares its support on the next open. A running editor may
need a student-chosen reload to activate an updated Zero extension. Opening VS
Code directly does not run the launcher updater.

**Zero: Check for Updates** and **Zero: Update Settings** in the editor's Command
Palette open fixed actions in the installed Windows launcher. Automatic check
and download/install preferences default on; explicit checks work when automatic
checks are off. Offline or failed background checks leave the editor usable and
retry on a later launch. Schools can restrict software execution or updates;
Zero does not bypass those restrictions.

## Layout and support

- Launcher: `%LOCALAPPDATA%\Zero`, managed by pinned Velopack 1.2.161, with a
  stable `%LOCALAPPDATA%\Zero\Zero.exe` stub and Start menu shortcut.
- Private JDK/editor and isolated editor data: `%LOCALAPPDATA%\ZeroData`.
- Initial project: `%USERPROFILE%\Zero\starter`.
- Initial native target: Windows 10 build 19041 or later, x64 (Intel/AMD), with
  the included .NET Framework 4.8. Windows ARM/32-bit are not an acceptance claim.

The private runtime and editor are outside Velopack's replaceable application
directory, so an update does not hold or terminate those processes. The launcher
reuses a compatible installed stable VS Code when possible; otherwise it prepares
a verified private copy. Java comes from the pinned private Temurin 21 ZIP.
URLs, sizes and SHA-256 hashes are authored in `setup/windows-downloads.json`.
Global PATH/JAVA_HOME, ordinary VS Code profiles and account credentials are not
modified. Zero sets Java and editor isolation on its owned child processes.
Project compilation uses Java 21 through `java.configuration.runtimes`; the Java
extension uses its bundled tooling runtime. The isolated settings support VS Code's
JSONC comments and trailing commas when reopening or repairing setup.

The owner waived preservation/migration requirements for existing student work
and settings in this implementation. Existing safe kit placement remains; no
arbitrary-folder replacement or deletion was introduced. Recognizable older
support is refreshed, identical support is a no-op, and older installers cannot
replace newer support. The automatic path reads trusted configuration from its
installed embedded payload rather than the editable kit copy.

## Build and test

Maintainers need Node 22+, a .NET SDK and .NET 8+ runtime for the pinned vpk tool;
students need neither Node nor the SDK. Restore the repository-local tool manifest
with `dotnet tool restore`. No global tool installation is necessary.

```sh
npm ci
npm run check
npm test
npm run test:windows
npm run test:updates:windows
npm run package
npm run verify:kit
node scripts/build-installers.mjs --platform windows
node scripts/verify-installers.mjs --platform windows
```

On macOS the C# fixture harnesses run with an existing Mono installation. They
use fake vendor tools, disposable folders and ephemeral test signing keys; no
real software installation or account operation occurs. Windows CI runs the same
fixtures against the Windows CLR and filesystem. That workflow does not execute
the installer or replace the required interactive Windows trial.

For a maintainer with a private local .NET runtime, explicit absolute
`ZERO_WINDOWS_DOTNET` and `ZERO_WINDOWS_VPK_DLL` paths select the tool runner.
The helper checks the pinned CLI version and verifies the actual executable's
Velopack startup hook. Inherited `VPK_*` options are removed; they cannot select
alternate signing commands or skip the hook check.

Development packaging creates `dist/installers/Zero-Setup-0.5.18-windows-development.exe`,
`Zero-0.5.18-full.nupkg` and `build-windows.json`. Outputs are measured and existing
Windows artifact files are not overwritten. Development updating is forced off,
even if production configuration is authored. The verifier checks exact package
bytes inside Setup, the embedded kit, dependency/identity/OS/shortcut contracts
and checksums. These unsigned candidates are not offered on the public website.

## Production trust and release

`release/windows-updater.json` now enables production trust with a provisioned
RSA-3072 public key and `https://zero.codepet.ca/updates/windows/stable.json`.
The matching private key is outside Git in a private maintainer directory. Back
it up securely before publishing; private bytes never belong in app resources,
website data or build logs. Development packages still force updating off.
See [signing cost/account setup and key custody](WINDOWS-SIGNING.md).

Windows Authenticode production packaging uses an explicitly supplied existing
certificate, clean reviewed source and an enabled authenticated updater:

```sh
npm run package:windows:production -- --certificate-sha1 <40-hex-thumbprint> --timestamp-url <HTTPS-timestamp-service>
```

This command requires Windows and validates actual signatures, the expected
certificate and timestamps before writing `build-windows-signed.json`. It never
discovers/imports certificates, provisions credentials or publishes assets.
Unsigned development builds cannot use this signing path accidentally.

Microsoft Artifact Signing is also supported with explicit public metadata and
an exact publisher subject, rather than a rotating leaf certificate thumbprint:

```powershell
npm run package:windows:production -- --azure-signing-metadata C:\private\zero-signing.json --publisher-subject "<exact Certificate Subject Preview>"
```

The service account and Public Trust identity validation are not provisioned.
Both signing methods verify the actual timestamped signatures after packaging.

The signed full package gets a second publisher signature over an exact-byte
release descriptor containing its immutable URL, package identity, version,
size and SHA-256. Use the explicit signer with an existing private key:

```sh
node scripts/windows-updater.mjs --root <repo-root> --version <version> --package <full-nupkg> --url <immutable-GitHub-URL> --private-key <private-key-file> --output <new-envelope-file>
```

The signature is RSA/SHA-256/PKCS#1. The launcher authenticates the descriptor,
then the complete package before Velopack extracts anything, and rechecks cached
bytes and the package immediately before apply. Default Velopack auto-apply is
disabled; only Zero's authenticated, serialized lifecycle can apply. Downgrades
and delta packages are excluded. Velopack's `releases.win.json` is not a trusted
feed and is not served by Zero.

Publish immutable Setup and full-package bytes under `windows-v<version>` only
after the Windows trial and owner authorization. Author the strict published
`release/windows-installer.json` manifest (asset, updatePackage, signing thumbprint,
sourceRevision, `nativeWindowsTested:true`) and the exact signed envelope at
`release/windows-update-feed.json`. Website preparation verifies their agreement
and public-key signature. The download button then uses the accepted EXE; until
then it retains the manual ZIP. The stable route serves only the verified exact
envelope; without one it returns 503. Promotion must follow anonymous verification
of actual public URLs, sizes and hashes. Publication is not performed by these
local build/signing commands.

For a faulty release, stop offering it and publish a corrected higher version.
Do not rewrite old public assets or reuse versions. An authenticated signed manual
installer remains the recovery route. Offline work stays available.

## Required actual Windows acceptance

Use disposable Windows machines/accounts: clean x64 Windows 10/11; existing
VS Code and bad JAVA_HOME; spaces/non-ASCII user paths; offline/retry/cancel;
school policy/antivirus/SmartScreen; high DPI, keyboard and Narrator; first JavaFX
Run/Stop; repeated launches and saved project restoration; open editor with unsaved
buffers and running Java app during a signed A→B update. Verify installed and
active extension versions separately. Check that app replacement waits for setup
helpers and that delayed/cancelled checks leave no persistent background process.
Cross-builds, Mono fixtures and archive inspection do not establish these results.
See [the automated smoke test and owner trial checklist](WINDOWS-TRIAL.md).

Primary integration references: [Velopack Windows](https://docs.velopack.io/packaging/operating-systems/windows),
[lifecycle](https://docs.velopack.io/integrating/overview),
[signing](https://docs.velopack.io/packaging/signing).
