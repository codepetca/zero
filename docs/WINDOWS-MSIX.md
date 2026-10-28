# Microsoft Store MSIX candidate

The production Store channel builds an unsigned x64 candidate from the current
kit and exact Partner Center identity `Codepet.zerostudio`, publisher
`CN=DC9AEBC0-4CAE-4681-9E52-20B0B1C14919`, publisher display name `Codepet`,
and expected package family name `Codepet.zerostudio_g62pw1js6rhjp`. The app
display name is **Zero Studio**. Verify the package family name on Windows and
in Partner Center. The separate `feasibility` channel retains the temporary
identity and isolated data for local experiments. Neither is certified or published.

## What this candidate changes

- A separate `ZeroDistribution=Store` (or `StoreFeasibility`) net48/WinForms build excludes
  Velopack, its startup hook, private update-feed resources and app replacement.
  The ordinary EXE build retains its existing behavior and dependency lock.
- The production identity is listed above, application ID `Zero`, with a version
  ending in 0. Store package versions offset the Zero major by one: Zero0.5.56
  maps to1.5.56.0, and Zero1.0.0 maps to2.0.0.0. This keeps the first component
  positive and upgrades ordered; product/kit versions remain unchanged. The
  maximum supported Zero major is65533; minor/patch are limited to65534
  because the mapped version also supplies .NET AssemblyVersion. Feasibility builds use the same mapping
  with their separate temporary identity.
- The manifest declares `Windows.FullTrustApplication`, `runFullTrust`, x64 and
  Windows10 build19041+. It adds a Start entry named **Zero Studio** for the Store channel.
  `MaxVersionTested` is a manifest compatibility setting, not a Windows test receipt.
- Production app data uses `%LOCALAPPDATA%\ZeroStudioStoreData`, the kit/project uses
  `%USERPROFILE%\Zero Studio`, and the instance-broker name is separate.
  MSIX can virtualize AppData; its exact installed behavior needs Windows testing.
  Embedded kit snapshots are retained by archive digest in a channel-owned sibling of app data (`ZeroStudioStoreData-embedded-kits`) so an open editor keeps its version across launcher exit and updates. Each reused snapshot is checked against a fresh extraction of the embedded kit; edited student support is not trusted. Retention grows with distinct kit versions.
  No package-install-directory writes or custom filesystem virtualization
  exemptions are requested.
- Before extraction or downloads, first run asks permission to acquire Java and Node.js,
  VS Code when needed, Java extension support and later Maven/JavaFX dependencies.
  Decline stops setup without writing consent or starting downloads. Consent is
  remembered in this channel's data folder.
- Editor children receive `ZERO_WINDOWS_DISTRIBUTION=store` (or `msix-feasibility` in that channel).
  Native and extension update commands open the fixed Microsoft Store Library
  URI. They cannot hand off to the ordinary EXE updater. The direct build clears
  an inherited Store marker before launching children. No application execution
  alias or external protocol registration is needed for this update route.
- Neither channel has been published, so actual update delivery requires a Store test flight or release.

The package embeds the current complete kit/VSIX, not the old Setup EXE. Java,
VS Code and Red Hat Java support retain their current vendor-to-user download
flow; their binary distributions are not bundled into the MSIX. The Store manages
the MSIX itself, not every tool obtained after first launch.

## Build and local verification

Use Node22+, a .NET SDK, and either the Windows SDK's `MakeAppx.exe` or Microsoft's
[cross-platform MSIX SDK](https://github.com/microsoft/msix-packaging) `makemsix`.
Packagers must be supplied by absolute path. The build does not download a
packager, install a certificate or contact Partner Center.

```sh
npm ci
npm run package
npm run verify:kit
npm run test:msix
npm run test:windows
npm run package:windows:msix -- --packager /absolute/path/to/makemsix --kind makemsix
```

On Windows, supply the absolute Windows SDK `MakeAppx.exe` path and
`--kind makeappx`. The ordinary Windows harness runs on the Framework CLR;
macOS harnesses run with Mono. On either host, these use fake vendor tools and
temporary fixtures, not real Java/editor installation.

Outputs are ignored `dist/msix/Zero-<version>-msix-store-x64.msix` and
`dist/msix/build-msix.json`. Existing output is never overwritten; use
`--output /absolute/new-empty-directory` for a later candidate. The receipt records
the package identity, source revision/dirty flag, kit and payload hashes, packager
hash, unsigned status and missing Windows/Store acceptance.

Verification checks Microsoft's schema-validated packing and independent SDK
unpacking, exact embedded kit and staged payload, exact manifest, absence of
unexpected runtime files, and every SHA-256 block in `AppxBlockMap.xml`.
Only the unsigned-package signature requirement is skipped during SDK unpack.
This does not establish Windows deployment, correct packaged filesystem behavior
or certification. An unsigned MSIX is not ready for ordinary double-click install.

For the initial Mac build, the maintainer compiled MSIX SDK revision
`25a65f5c1690930813bcc10cdf1d59fa865f2bb1` with CMake3.31.6, AppleClang and
`MACOS=on`, `MSIX_PACK=on`, `XML_PARSER=xerces`, `USE_VALIDATION_PARSER=on`,
`USE_MSIX_SDK_ZLIB=on`, `MSIX_TESTS=off`, `MSIX_SAMPLES=off`, arm64/Release.
Build tools and their dependencies stay in ignored `.verification/msix/` and
are not part of the student package. Windows SDK packaging and Windows App
Certification Kit validation remain separate acceptance steps.

## Changes and decisions required before Store submission

1. **Identity and coexistence.** Verify the supplied Partner Center identity and
   expected package family name on Windows. Validate coexistence, data paths and
   migration behavior with the existing EXE/ZIP population.
2. **Full-trust approval.** Explain `runFullTrust` in Submission options: Zero
   launches the editor/compiler, accesses student-selected projects and executes
   student-authored Java under the ordinary user's permissions. This requires
   [Store capability approval](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations).
   Local packaging does not grant it.
3. **Dependency disclosure and terms.** Put external dependencies at the beginning
   of the listing. Current [Store Policies v7.20](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies),
   effective2026-10-22, require consent for enhancing acquisitions (10.1.5),
   described functionality for downloaded code (10.2.2), disclosed dependencies
   (10.2.4) and clean removal (10.2.7). Ask certification to confirm the first-run
   dependency acquisition model; no Store approval has been obtained.
4. **Vendor license review.** Preserve the downloaded distributions' notices.
   The [Microsoft VS Code binary license](https://code.visualstudio.com/license)
   differs from Code-OSS's license and restricts redistribution. Downloads directly
   from Microsoft avoid Zero hosting the binaries, but do not alone establish
   permission for this bootstrap arrangement. Resolve that interpretation before
   publication and make vendor terms/privacy accessible before acquisition.
   The current consent prompt covers downloads; it does not constitute explicit
   acceptance of each vendor's license. Continue using official VS Code's
   [documented extension CLI](https://code.visualstudio.com/docs/configure/command-line),
   account for [Marketplace terms](https://aka.ms/vsmarketplace-ToU),
   [Red Hat Java notices](https://github.com/redhat-developer/vscode-java/blob/main/LICENSE)
   and [Temurin's distribution notices](https://adoptium.net/docs/faq).
   Review extension version/update reproducibility; `redhat.java` is currently
   acquired by identifier rather than an exact pinned Marketplace version.
5. **Privacy, age rating and listing.** Prepare a public desktop-app privacy policy
   covering Zero/GitHub and downloaded vendor tools/telemetry accurately; do not
   claim no collection without checking them. Supply support URL, screenshots,
   category, description and an accurate IARC questionnaire. Provide reviewer
   instructions that demonstrate local Java editing/running without school or
   Pika credentials. Microsoft documents the process in
   [Store onboarding](https://learn.microsoft.com/en-us/windows/apps/publish/get-started).
6. **Native Windows acceptance and updates.** On disposable x64 Windows10/11,
   validate with the Windows SDK and App Certification Kit, then install with an
   explicitly trusted test signature or an authorized Store test flight. Do not
   weaken developer-machine certificate or execution policy. Test Start activation,
   consent decline/accept/retry, Java/editor/extension acquisition, first JavaFX run,
   reopen, paths with spaces/non-ASCII, offline recovery and standard-user operation.
   Confirm the actual editor process receives the distribution marker, including
   when ordinary VS Code is already running. Test an installed A-to-B package
   update while editor/student app are open, update controls, repair and uninstall.
   Confirm removal/retention of external support folders and preservation of student
   projects; current external tooling cleanup has not been accepted. Test school
   restrictions separately; Store signing cannot bypass their device policies.

Draft listing opening for certification review:

> Zero requires Java21, Node.js, Microsoft Visual Studio Code and Java extension support.
> With your permission, first setup downloads missing tools from their vendors;
> the first app build also downloads Maven and JavaFX. Internet access is required
> for that setup. Zero is a local Java teaching kit that lets students edit,
> compile and run their own Java programs.

This is a proposed description, not a submitted listing or vendor approval.

## Version correction after the first upload attempt

The0.5.55 candidate used Store version0.5.55.0. Microsoft Store requirements
require a positive first component, unlike the general OS package schema. SDK
pack/unpack success therefore did not establish Store readiness. The correction
uses the mapping above and tests rollover/overflow. The upload timeout did not
identify this as its cause. Prior Windows installation receipts tested the EXE,
not MSIX deployment; Windows App Certification Kit and actual Store installation
remain separate gates. See [Store requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements).
