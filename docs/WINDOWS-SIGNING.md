# Windows signing and feed setup

Zero needs two independent signatures: Windows Authenticode identifies the
publisher of executable files, and Zero's RSA key authenticates the entire update
package. A self-signed Windows certificate does not provide public Windows trust.

## Cost and account choice

The owner has no signing account and prefers free or very cheap signing. No paid
subscription, enrollment or external application has been started. The current
implementation supports an existing certificate or Microsoft Artifact Signing.

| Route | Cost | Fit for Zero |
| --- | --- | --- |
| Microsoft Artifact Signing, Public Trust | Starts around US$9.99/month | Lowest-cost straightforward option verified for the current direct EXE and updater; Canadian individuals are eligible. Owner identity verification is required. |
| SignPath Foundation | Free if accepted | Application and reputation review required. Its policy restricts signing upstream binaries. Confirm Velopack Setup/stub/updater compatibility with the Foundation before implementing this route. Acceptance is not assured for a new project. |
| Microsoft Store, MSIX | Free developer onboarding/signing/distribution for individuals | Viable free alternative. Requires owner identity verification, a Store listing, MSIX packaging and Store-managed updating. This EXE's Velopack updater must not replace a Store installation. School Store availability also needs checking. |

For direct downloads, the recommended low-cost route is Microsoft Artifact
Signing. New signed apps may still show SmartScreen warnings while reputation
builds. Paying more for EV solely to remove those warnings is not justified.
The free Store route needs a separate packaging decision; submitting the current
EXE to the Store still requires publisher signing.

Sources checked 2026-10-16: [Microsoft signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options),
[SmartScreen guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation),
[free Store registration](https://learn.microsoft.com/en-us/windows/apps/publish/whats-new-individual-developer),
[Store packaging/signing](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/publish-first-app),
[SignPath Foundation conditions](https://signpath.org/terms.html).

## Microsoft account setup still needed

1. The owner selects an Azure subscription and the Basic Artifact Signing tier.
   Create an Artifact Signing account in a supported region.
2. Complete **Public Trust** identity validation in the Azure portal. For an
   individual, the billing account must be Individual and its legal name/address
   must match the identification supplied privately to Microsoft. A personal
   account publishes the verified personal name; choose the entity deliberately.
3. Create a Public Trust certificate profile, for example `zero-release`. Save
   its exact generated **Certificate Subject Preview** and the regional endpoint.
4. Grant the build identity the certificate-profile signing role, scoped to this
   profile. Authenticate on the Windows build machine using Azure's supported
   credential flow. Keep tokens/passwords out of metadata, Git and chat.

See [Microsoft's setup quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
and [signing integration](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations).
The owner must perform identity verification; it cannot be completed by a build
script. No service-principal secret is required for an interactive maintainer
using an existing Azure CLI sign-in. CI authentication can use a separately scoped
workload identity when the account and approved workflow are available.

Create a local metadata file containing only these public fields:

```json
{
  "Endpoint": "https://eus.codesigning.azure.net",
  "CodeSigningAccountName": "your-actual-account",
  "CertificateProfileName": "zero-release"
}
```

Use the actual account region. On a clean, reviewed Windows checkout, build the
kit and then sign through Velopack at every required packaging stage:

```powershell
npm ci
dotnet tool restore
npm run package
npm run verify:kit
npm run package:windows:production -- --azure-signing-metadata C:\private\zero-signing.json --publisher-subject "<exact Certificate Subject Preview>"
```

The build validates actual Windows trust, timestamps and publisher identity for
Setup and owned executables; it preserves and verifies the pinned upstream
Newtonsoft signature. Azure leaf certificates rotate, so the policy binds the
exact publisher subject and records actual leaf thumbprints in the receipt.
Existing output artifacts are never overwritten. Move a previous development
candidate aside before producing the signed full package with the same filename.
Pinned Velopack 1.2.161's real Windows Azure signing path still needs a live test;
upstream [issue 1045](https://github.com/velopack/velopack/issues/1045) is a known
test target. Packaging failures must stop the release.

## Update-feed key already provisioned

Production configuration in `release/windows-updater.json` now contains the
public RSA-3072 key and `https://zero.codepet.ca/updates/windows/stable.json`.
The private key is held on the maintainer Mac, outside the repository:

`~/Library/Application Support/Zero/ReleaseKeys/windows-update-private.pem`

The directory is mode 0700 and the key mode 0600. Keep an encrypted backup in the
owner's password manager or other protected offline storage before the first
public release. Losing this key breaks update continuity; rotating it needs a
deliberate migration. No private key was uploaded or placed in build artifacts.
`npm run setup:updates:windows -- --root <checkout> --private-key <absolute path>`
reuses an exact matching key and refuses implicit replacement of established trust.

Development packages always embed a disabled updater even when production trust
is configured. The public feed stays unavailable until a signed, Windows-tested,
published package has matching release metadata. This avoids advertising an
untested or unsigned build.

After the signed A-to-B trial in [Windows trial](WINDOWS-TRIAL.md), follow
[the production feed/release steps](WINDOWS-INSTALLER.md#production-trust-and-release).
Sign only the measured production full package; never publish the unsigned vpk
index. Feed promotion and public publication are separate from local key setup.
