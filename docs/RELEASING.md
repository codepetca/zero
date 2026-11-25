# Releasing Zero

Check and update the dated [release ledger](RELEASE-LEDGER.md) when reconciling or preparing releases. Verify live publication status independently.

For Zero Studio releases through the Microsoft Store, follow the
[publishing settings for Store submissions](WINDOWS-MSIX.md#publishing-after-certification).

`release/kit.json` is the release source of truth. Published versions and their
asset bytes are immutable. A kit release has exactly three public assets: the complete
kit, standalone starter and versioned VSIX. Optional component archives stay local.
The workflow prepares review artifacts with read-only GitHub permissions; it
never creates a tag, release, deployment or account credential.

## Publish a new version with one command

Release tooling is for maintainers; students do not need Node.js or GitHub CLI.
Use Node.js 22+, Git and a GitHub CLI (`gh`) already signed into an account allowed
to publish releases and merge PRs in `codepetca/zero`. No additional token, GitHub
App, Vercel secret or account-setting change is needed. Publication uses your
existing CLI account; CI preparation retains read-only GitHub permissions.

1. Create a feature branch from current `main`. Choose an unused numeric version,
   for example `0.5.2`. Set the kit/extension versions, tag and filename together:
   `release/kit.json` → `kitVersion`, `publication.tag` and extension filename;
   `extension/package.json` → `version` and the `zero-student-explorer` title
   (`Zero <version>`). Set publication status to `local` and
   clear the main assets' old `url`, `size` and `sha256` values. Keep optional
   components local. Update the VSIX filename in `release/START-HERE.md`,
   `docs/GETTING-STARTED.md` and `student-template/README.md`. Change core versions
   only when the core actually changes. Keep the last verified README download
   until the new release is public.
2. Complete the normal source PR review and CI, then merge it to `main`.
3. Approve publishing that exact version by running this once from a Zero checkout:

```sh
npm ci
npm run release:publish -- --version 0.5.2
```

The publisher works in an isolated temporary checkout and leaves your current
branch, working files and local `dist/` untouched. It selects the canonical remote
`main`, starts the preparation workflow, correlates its run to the selected source
and waits for successful checks. Before dispatch or publication, it validates the
README manual-kit link slot and published platform download metadata. It downloads
the sealed candidate and verifies
its source/run receipt, exact filenames, licenses, sizes and SHA256 values.

It creates and verifies a draft targeting that source commit, publishes precisely
the three main files, and retrieves each public download without authentication
to check its bytes. It updates `release/kit.json` and README's download label/link, plus the verified
Portable manifest when explicitly supplied for a full release, and opens the metadata PR. Pending checks can be polled, but required
review, outstanding review requests or a blocked merge stop the run and
leave the exact published release and PR intact. Satisfy the actual GitHub review
or branch requirement, then resume with the same version and successful preparation
run ID. Owner publication authority and independent source review remain required;
AI review does not impersonate a human approval. The owner removed main's branch
protections; do not re-enable or bypass account rules as part of releasing.
The resumed run merges the exact checked head
through the normal PR path and confirms the merged manual-kit metadata and
README link. The website intentionally offers Mac and Microsoft Store buttons;
it does not expose a general manual-kit button. Public platform verification
checks the visible download choices on the homepage (`/`), matches the Mac
link to the current published installer (or its public fallback), measures that
DMG's size/SHA256, and requires the exact Microsoft Store listing link. Hidden or
script-only links, unexpected choices and redirected pages cannot satisfy it.
This verifies the platform download surface separately from the three anonymous
manual-kit assets; it does not claim the website exposes the manual kit, that a
new kit version is observable on the website, or that Store installation passed.
It reports release/PR URLs and a completion message; it never edits credentials,
account settings, branch rules or community artifacts.

## Retry and verify

A stopped run can leave a correctly published release or an open metadata PR.
Do not delete the release, replace files or invent a new version just to retry.
Keep the reported preparation run ID and use the same version:

```sh
npm run release:publish -- --version 0.5.2 --run-id <successful-run-id>
```

Resume only accepts the same successful source-bound candidate and exact existing
release files. A conflicting draft, changed bytes/source, unexpected metadata PR,
failed checks, merge denial or unavailable verification stops publication/update
rather than replacing another result or bypassing a rule. Fix the reported cause
and resume the same verified run. An expired preparation artifact needs maintainer
investigation; an already public release remains immutable.

After metadata has merged, rerunning without a run ID automatically verifies the
completed release. You can also request this explicitly with the read-only check:

```sh
npm run release:publish -- --version 0.5.1 --verify-only
```

This checks the published kit manifest, tag, README link, all three public asset
size/SHA256 values and the independent live platform choices described above; it
cannot dispatch a workflow, create/publish a release, change a branch or merge a PR.
If live platform links differ from published platform metadata, retry after that
platform deployment is verified; a timeout does not undo the published manual-kit
release or merged metadata PR.

`--verify-only` targets the current version recorded on main and requires that
manifest to be published. After main advances to a newer local candidate, it
rejects both verification of that unpublished version and requests for the older
published version; it does not switch to `release/published-kit.json`. Verify the
older public assets and receipts directly when needed. The website can continue
using its retained published fallback while local development proceeds.

After publication, the next development cycle can use the normal new-local-version
steps above. Preserve the exact last published kit manifest in
`release/published-kit.json`, keep README's public link and all public native
installer/feed metadata pinned, and update the new local kit/extension version,
bundled VSIX references and local Mac build counter required by the build-order
guard. Advancing that source counter does not change the public signed feed. A local candidate and CI review artifacts
are not a release; publishing still requires explicit authorization.

## Preparation workflow and manual fallback

Every source PR runs **Release checks and preparation**: configuration, release
failure tests, extension/starter tests, finite JavaFX examples under Xvfb, website
checks and, for a new local version, packaging/archive integrity verification.
Published manifests skip rebuilding immutable downloads. Only an explicit publish
command carries out publication; a push, tag or ordinary PR never publishes.
Manual workflow dispatch and resuming its successful run through the publisher remain a fallback below.

Use the selected ref deliberately: `gh workflow run release-review.yml --ref
<reviewed-ref> -f version=0.5.2`. The workflow file must exist on the default
branch before GitHub can dispatch it. PR artifacts are useful previews; use the
final manually prepared run as the release candidate. Download that run's review
artifact through GitHub Actions or `gh run download <run-id> --name
zero-0.5.2-review-<run-id> --dir <review-directory>`.

### Verify the public Project → New starter

Before preparing a release, compare its generated `zero-starter` with the
public template at [codepetca/zero-starter](https://github.com/codepetca/zero-starter).
If they differ, prepare the template from the reviewed candidate source with
`node scripts/prepare-project-templates.mjs` and update it through a reviewed
template PR. When the builder profile changes, review the template PR in
advance and merge it immediately before manual release preparation. GitHub
generates projects from the template's default branch. Older editors reject
the new browser builder, so tell students which editor update they need.
Editors with the Project → New preflight compare the public starter's builder
and framework with their own package before creating a repository. They direct
students to check for a Zero update if the files differ.

Manual kit preparation compares the public tree and executable bits with the
generated starter. It checks the builder against the packaged VSIX, opens the unedited starter
in JavaFX, and replays the Greeting lessons from their Markdown. It runs the
tutorial result using the native Run Maven command and tests the exported
WebFX app in Chrome.
The publisher checks the receipt against the release's VSIX and rechecks the
template tree immediately before making the draft public. A commit with the
same tested tree can resume. If the tree differs, restore the reviewed tree
before resuming with the same run ID, or review a new candidate and version. Ordinary source PRs can still package
review artifacts while the public starter is being prepared.

Manual preparation starts each starter API read anonymously. On HTTP403/429,
it can retry once with that job's existing read-only `GITHUB_TOKEN`, only for
the fixed public starter metadata, `main` branch and SHA-addressed recursive
tree endpoints. Repository identity, public/template status, default branch,
response bounds, exact tree and repeated branch checks remain required.
Browser/JDK provisioning runs in a separate step. The verifier removes the
token from its environment before running project code, Maven, Java or Chrome.
The publisher's final starter check and ordinary local checks remain anonymous.
This fallback neither adds repository permissions nor proves anonymous API
availability from the preparation runner; the publisher still requires its own
anonymous verification before publication.

To run the same check locally with Node 22.23.4 or later in the Node 22 line,
JDK 21, Chrome and a display (Xvfb on headless Linux):

```sh
node scripts/verify-project-new.mjs dist/zero-X.Y.Z.vsix dist/PROJECT-NEW.json
```

## Review and publish exact bytes

Review `SOURCE.txt` against the reviewed commit and successful run. In the extracted
review directory, run `sha256sum -c SHA256SUMS` (macOS: `shasum -a 256 -c
SHA256SUMS`). Compare all three sizes/hashes with `release.json`, inspect their MIT
notices and readable source, and perform the appropriate editor/platform trial.
CI's Linux virtual display does not establish physical Windows/Mac/Linux setup or
a real GitHub student upload. Artifacts expire after 14 days; if expired, prepare
and review a new candidate, retaining that run's exact bytes and receipts.

Publication requires intentional owner authorization, separate from preparation.
Resume a successful manual run through the kit publisher so the exact artifact
bytes and Project → New receipt are checked before the draft becomes public:

```sh
npm run release:publish -- --version X.Y.Z --run-id RUN_ID
```

The publisher uploads the three reviewed assets and verifies their hashes and
the exact commit. Use the same run to resume an interrupted draft. Published
versions are immutable.

## Verify public downloads and update the website

Download each of the three public asset URLs without authentication to a separate
directory. Verify successful responses, exact names/sizes and the SHA256 values
from the reviewed `release.json`. Use GitHub's actual asset URLs; do not mark a
guessed or inaccessible link published. Keep the original review bytes intact.

In a second reviewed metadata PR, set `publication.status` to `published` and
copy the three verified `size`, `sha256` and `url` values into `release/kit.json`.
Keep version, repository, tag and filenames unchanged, and optional components
local. Update README's direct kit download link to that same verified kit URL.
This promotion and link edit remain an explicit metadata change for owner review.
Run configuration and website typecheck/tests/build; CI skips rebuilding
this published version. The website reads the manifest during preparation/build,
while its public buttons continue to select Mac and Microsoft Store downloads.
Verify the README manual-kit link and all three anonymous asset hashes; verify
platform links and Mac installer bytes separately as described above.
Record the release URL, target commit, run ID, review verdict and public download
verification in the short current handoff and tracked [evidence index](EVIDENCE.md).
Keep logs/binaries ignored and archive phase detail. Future improvements start
with another new local version.


## Separate Mac installer candidate

### Automatic-update candidates from0.5.15

Advance `release/mac-updater.json` buildNumber along with the new kit/extension
version. Never reuse a distributed native build number. The current published
feed remains valid while a newer local version is prepared; release preparation
checks both version and build ordering against it.

Before changing `release/installer.json` to a newer local candidate, retain the
last anonymously verified published native manifest in
`release/published-installer.json`. Website preparation uses that independent
snapshot to keep the existing signed public feed valid while a newer local
installer is staged. On promotion, update the snapshot to the same verified
published installer as the new feed; never label a local candidate published.

After signing, notarization and stapling, commit the measured local native
manifest. Then seal its final update signature and signed feed:

```sh
npm run release:prepare:updates
npm run release:prepare:mac
```

The updater key's Keychain account is `ca.codepet.zero.updates`. For an explicitly
selected private key file, use `release:prepare:updates -- --key-file <absolute-private-path>`;
the tool requires an owned private regular file and never prints its contents.
Keep the recovery copy outside the repository with private permissions. Only the
public key belongs in source. No new account credentials are needed for builds.

The update preparation writes a new immutable
`dist/installers/updates-<version>/` containing `appcast.xml` and strict
`mac-update-feed.json`. Candidate sealing includes these exact bytes and public
configuration. It independently verifies the final DMG Ed25519 signature, feed
signature and agreement with the measured installer. There are no delta files
or extra assets in the native GitHub release.

Publish and anonymously verify the one immutable DMG before promoting the feed.
In the reviewed metadata change, publish the installer manifest, copy the sealed
feed to `release/mac-appcast.xml`, and copy its metadata to
`release/mac-update-feed.json`, changing only publication.status to published.
Do not edit the signed XML. Website preparation rejects an inconsistent feed,
key, version, URL, size or signature; the route serves the exact validated feed
bytes at `/updates/macos/appcast.xml` with a five-minute cache lifetime. Before
the first feed is promoted the route returns404.

Verify the deployed feed's exact digest/signature and DMG's public bytes against
the sealed candidate. Removing a faulty entry stops future offers but cannot
recall every staged download. Recovery is a higher-numbered corrected build or
an intentional manual DMG replacement; never replace old GitHub assets. Keep
old kit support backups and JDK paths when preserving user settings.

The historical commands below illustrate the existing single-DMG release process;
use the actual sealed candidate's version, filename and tag.

`release/installer.json` is the optional, strict native manifest. It describes
only the measured universal Mac DMG and its original clean build source, embedded
kit, signer and accepted notarization submission. It currently records the
published0.5.8 installer. The planned0.5.9 candidate will use independent tag
`setup-v0.5.9`; `v0.5.9` is the separate three-asset kit release. Update the native
manifest only after measuring and verifying the new0.5.9 artifact. The existing
`release:publish` command and Linux CI preparation do not publish or rebuild native
installers. The historical prohibition on unsigned Windows downloads was
superseded by the owner's 2026-10-19 authorization for the explicit 0.5.21 preview.
Its `windows-preview-v0.5.21` release contains only the measured development EXE;
`release/windows-preview.json` records its source, size, SHA256 and limitations.
Verify authenticated draft bytes and anonymous public bytes before merging that
metadata. It does not publish an update feed or weaken signed production checks.

For0.5.9, first build and verify a new kit and Mac installer from a clean reviewed
source, sign with the authorized existing identity, then notarize/staple/verify.
Record measured native metadata as local. Preserve all earlier published bytes.
The command below seals those exact tested bytes; it does not create them:

```sh
npm run release:prepare:mac
```

Seal before promoting the kit manifest to published: release/kit.json is part of
the protected native source. Changing it beforehand invalidates source equivalence.

This requires a clean committed checkout and the original installer build commit
in local Git history. Native Mac, framework, extension, profile, launchers,
student source and packaging inputs must be unchanged from that build. Website,
maintainer docs and this preparation tooling can change independently. Preparation
verifies the current kit/source/archive/Maven checks and actual signed DMG payload,
Developer ID signatures, staple and Gatekeeper assessments without launching setup.
It never rebuilds, signs, submits notarization or changes credentials.

The new ignored `dist/candidates/mac-0.5.9-<preparation-commit-prefix>/` directory
contains the exact DMG and three kit files, independent `installer.json`,
`build-macos-signed.json` and `release.json` receipts, `candidate.json`, `SOURCE.txt`,
`NOTES.md` and `SHA256SUMS`. Built installer source and preparation source are
recorded separately, with the compared source paths. Existing output is a stop
condition, including an empty directory. Use `-- --output <new-directory>` only
for a separate immutable candidate; retain the old one. Linux CI cannot recreate
Apple-notarized Mac bytes. This local preparation grants no publication authority.

Candidates with bundled Git also seal `git-2.56.1-source.tar.gz` and
`dugite-native-2.56.1-build-source.tar.gz`. The native release carries both
source archives beside the DMG so students can download the corresponding
source and build scripts independently of the app update.

## Later authorized native publication

Publication remains a separate owner decision after source review and candidate
verification. From the sealed directory, first run `shasum -a 256 -c SHA256SUMS`
and inspect both source revisions in `candidate.json`. Use its nativeTag/kitTag and
installer.json filename as the authoritative values; the0.5.9 commands below
apply only to a matching0.5.9 candidate. Confirm `setup-v0.5.9` has
no existing tag/release, and confirm the kit release plan separately. Do not use
`release:publish` for the DMG or add it to the kit release. An explicitly authorized
owner can create a native draft targeting the preparation source:

```sh
gh release create setup-v0.5.9 --repo codepetca/zero --target <preparation-commit> \
  --draft --title 'Zero Setup 0.5.9 for Mac' --notes-file NOTES.md \
  Zero-Setup-0.5.9-macos.dmg
```

For a candidate with bundled Git, include both source archives by their exact
filenames in that same native draft command along with the DMG. Check the draft
target and its expected native asset list. Download each draft asset separately and
compare its exact size and SHA-256 with `candidate.json` and `SHA256SUMS`.
Do not rebuild, use wildcards,
replace assets, pass `--clobber`, or delete an existing release/tag. After explicit
owner authorization, publish that verified draft through GitHub's release UI or
`gh release edit setup-v0.5.9 --repo codepetca/zero --draft=false`.

Read back each public native asset URL, download it without authentication and
verify its exact size and SHA-256 against the sealed candidate. In a separately reviewed metadata
change, set native `publication.status` to `published` and add that verified exact
GitHub asset URL to `asset.url`. Keep the version, tag, digest, size, original source
and signer unchanged. Local metadata has no public URL; never promote a guessed
or inaccessible URL. Run website typecheck/tests/build and check the deployed
Mac link/bytes after separately authorized metadata integration/deployment. Students
then choose Mac setup or Microsoft Store from the homepage download buttons. Preserve the last independently verified
published kit manifest in `release/published-kit.json` while the current kit is
local; its three links retain their own version labels. Publishing Mac setup
does not publish its bundled kit separately. Keep README's verified previous kit link
until that kit's independent publication is complete.


## Windows portable school pilot

A full website release includes the published kit, Mac setup and a matching
Windows Portable staging ZIP and complete VSCodium ZIP. The Microsoft Store and the standalone Windows
installer follow their own publication schedules. Manual **Release checks and preparation**
builds `zero-<version>-portable-<run-id>` from the same sealed kit bytes as the
manual kit release. Keep the successful run and its matching kit and Portable
artifacts together. Manual preparation also retains
`zero-<version>-portable-bundled-<run-id>` with the complete ZIP and its measured
`portable-bundle-candidate.json`. Publish its third-party notices and source
companion archives alongside it. A separate local Mac or Windows build can have different kit
archive bytes even at the same version.

1. Download the Portable artifact from the same successful preparation run.
   Run `shasum -a 256 -c SHA256SUMS.txt` from that directory and compare
   `portable-candidate.json` with the preparation source and kit SHA-256.
2. With release authorization, create an unsigned school pilot draft prerelease
   named `windows-portable-pilot-v<version>`, targeting that exact source commit.
   Attach only `Zero-<version>-windows-portable-pilot-staging-x64.zip` and
   `SHA256SUMS.txt`. Download the draft assets and verify their exact bytes
   before publishing. Keep an existing verified release and its files intact
   when retrying. If a preparation run failed after uploading an artifact,
   start a fresh manual dispatch to get a new run ID.
3. Download the public ZIP and checksum anonymously and verify them against the
   candidate. Copy the verified `portable-candidate.json` into
   `release/windows-portable-pilot.json` as part of the final release promotion
   PR. When the published kit and Mac setup reach the same version, CI requires
   the matching Portable metadata and verifies both public tags and the launcher
   against the exact published kit. Kit-only releases can keep the prior download
   while Mac setup is still at an earlier version. Before merging a release
   promotion, recheck it against current main if another promotion merged since
   its checks ran.
   If the matching Mac setup is already public, pass
   `--portable-manifest /absolute/path/to/portable-candidate.json` with the
   original `--run-id` to `release:publish`. It verifies the Portable release
   before publishing the kit and includes both manifests in the kit metadata PR.
   Keep the same options when resuming. If Mac setup was promoted while a
   kit-only metadata PR was open, bring that PR up to date with main and add the
   verified Portable manifest. Review and check the updated PR head, then resume
   the original run with `--portable-manifest`. When both assets are public
   through separate flows, use a reviewed promotion PR with all matching metadata.
4. After deployment, check the versioned link at
   [Downloads → Windows portable pilot](https://zero.codepet.ca/downloads#windows-portable)
   and check that both Portable links have the intended versions and sizes.
   Verify the school's [student login and run steps](WINDOWS-PORTABLE.md).
   Existing school installs update when IT replaces the staged folder.

For local preparation from a clean source checkout with an already verified
`dist/` kit, run `node scripts/build-windows-portable.mjs --public NEW_OUTPUT_DIRECTORY`.
An earlier release needs its original sealed kit receipt and exact published
kit ZIP, verified against the original source checkout.

The complete ZIP is a separate immutable prerelease,
`windows-portable-bundled-v<version>`. The build records the launcher source
and the public kit's source separately so an added distribution can reuse exact
published kit bytes. Publish the complete ZIP, checksum, `SOURCE-INDEX.json`
and measured source archives after review and the hosted Windows cold/warm trial.
Download and verify each draft asset before publication and each public asset
without authentication afterward. Promote its measured manifest to
`release/windows-portable-bundle.json` in the reviewed metadata PR. The website
keeps the two independent download links. Never replace an already public asset.
