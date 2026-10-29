# Releasing Zero

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
   for example `0.5.57`. When `release/kit.json` is already local, run
   `npm run release:version -- 0.5.57` to update the aligned kit/extension version,
   tag and VSIX filename. Check the guide edits and working tree. This command
   does not choose a version, verify remote availability, build or publish.
   For a published manifest first prepare a new local manifest; never overwrite
   published release metadata or assets. Set publication status to `local` and
   clear the main assets' old `url`, `size` and `sha256` values. Keep optional
   components local. Update the VSIX filename in `release/START-HERE.md`,
   `docs/GETTING-STARTED.md` and `student-template/README.md`. Change core versions
   only when the core actually changes. Keep the last verified README download
   until the new release is public.

After independently preparing the signed, notarized Mac candidate and Windows
Store MSIX candidate from the same clean source and kit, `npm run release:pair --
--mac <mac-candidate-dir> --windows <windows-candidate-dir> --version <version>
--source <full-commit-sha> --output <new-receipt-path>` verifies their receipts,
artifact hashes, Store mapping and embedded Windows kit bytes. It records the
limits of Mac receipt evidence; it does not build the artifacts or establish WACK,
installation, certification or publication. Existing checks and release holds apply.
2. Complete the normal source PR review and CI, then merge it to `main`.
3. Approve publishing that exact version by running this once from a Zero checkout:

```sh
npm ci
npm run release:publish -- --version 0.5.2
```

The publisher works in an isolated temporary checkout and leaves your current
branch, working files and local `dist/` untouched. It selects the canonical remote
`main`, starts the preparation workflow, correlates its run to the selected source
and waits for successful checks. It downloads the sealed candidate and verifies
its source/run receipt, exact filenames, licenses, sizes and SHA256 values.

It creates and verifies a draft targeting that source commit, publishes precisely
the three main files, and retrieves each public download without authentication
to check its bytes. It generates only `release/kit.json` and README's download
label/link and opens the metadata PR. Pending checks can be polled, but required
review, outstanding review requests or a blocked merge stop the run and
leave the exact published release and PR intact. Satisfy the actual GitHub review
or branch requirement, then resume with the same version and successful preparation
run ID. Owner publication authority and independent source review remain required;
AI review does not impersonate a human approval. The owner removed main's branch
protections; do not re-enable or bypass account rules as part of releasing.
The resumed run merges the exact checked head
through the normal PR path, then waits for Vercel's existing Git
integration and checks the actual live kit anchor and downloaded bytes. The
landing action may link directly to the exact kit URL or to the same-site
`/downloads` chooser (or the retained `/learn#downloads` path); the chooser must contain one exact kit anchor inside
its downloads section. A URL in script/JSON does not establish a download link.
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

This checks the current published manifest, public downloads and live site; it
cannot dispatch a workflow, create/publish a release, change a branch or merge a PR.
If the live site has not yet deployed after a successful merge, retry verification;
a timeout does not undo the already published release or merged PR.

## Preparation workflow and manual fallback

Every source PR runs **Release checks and preparation**: configuration, release
failure tests, extension/starter tests, finite JavaFX examples under Xvfb, website
checks and, for a new local version, packaging/archive integrity verification.
Published manifests skip rebuilding immutable downloads. Only an explicit publish
command carries out publication; a push, tag or ordinary PR never publishes.
Manual workflow dispatch and deliberate CLI publication remain a fallback below.

Use the selected ref deliberately: `gh workflow run release-review.yml --ref
<reviewed-ref> -f version=0.5.2`. The workflow file must exist on the default
branch before GitHub can dispatch it. PR artifacts are useful previews; use the
final manually prepared run as the release candidate. Download that run's review
artifact through GitHub Actions or `gh run download <run-id> --name
zero-0.5.2-review-<run-id> --dir <review-directory>`.

## Review and publish exact bytes

Review `SOURCE.txt` against the reviewed commit and successful run. In the extracted
review directory, run `sha256sum -c SHA256SUMS` (macOS: `shasum -a 256 -c
SHA256SUMS`). Compare all three sizes/hashes with `release.json`, inspect their MIT
notices and readable source, and perform the appropriate editor/platform trial.
CI's Linux virtual display does not establish physical Windows/Mac/Linux setup or
a real GitHub student upload. Artifacts expire after 14 days; if expired, prepare
and review a new candidate, retaining that run's exact bytes and receipts.

Publication requires intentional owner authorization, separate from preparation.
Confirm the version's tag/release remains absent immediately before creating it.
An owner can create a draft with the existing GitHub CLI, targeting the exact
reviewed source commit from `SOURCE.txt`:

```sh
gh release create v0.5.2 --repo codepetca/zero --target <reviewed-commit> \
  --draft --title 'Zero 0.5.2' --notes-file <reviewed-release-notes> \
  zero-bootstrap.zip zero-starter.zip zero-0.5.2.vsix
```

Run this in the extracted review directory. Upload exactly those three files;
do not use a wildcard, `dist/`, a component archive or `--clobber`. Check the draft
target and three asset names/sizes/hashes. Publish deliberately through GitHub's
release UI or `gh release edit v0.5.2 --repo codepetca/zero --draft=false` after
owner approval. Do not rebuild between review and publication. An existing tag or
release is a stop condition: investigate it and choose a new version as needed,
never delete or overwrite an immutable release to make preparation succeed.

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
so merging the metadata PR updates its download links through the configured
hosting path. Verify the live site's download retrieves the same measured kit.
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

Check the draft target and its single asset, download its bytes separately and
compare the exact size/SHA256 with `installer.json`. Do not rebuild, use wildcards,
replace assets, pass `--clobber`, or delete an existing release/tag. After explicit
owner authorization, publish that verified draft through GitHub's release UI or
`gh release edit setup-v0.5.9 --repo codepetca/zero --draft=false`.

Read back the real public asset URL and download it without authentication; verify
its exact size/hash against the sealed candidate. In a separately reviewed metadata
change, set native `publication.status` to `published` and add that verified exact
GitHub asset URL to `asset.url`. Keep the version, tag, digest, size, original source
and signer unchanged. Local metadata has no public URL; never promote a guessed
or inaccessible URL. Run website typecheck/tests/build and check the deployed
Mac link/bytes after separately authorized metadata integration/deployment. The
landing action then opens `/downloads`, where students choose Mac setup or
the ZIP for Windows/Linux/manual setup. Preserve the last independently verified
published kit manifest in `release/published-kit.json` while the current kit is
local; its three links retain their own version labels. Publishing Mac setup
does not publish its bundled kit separately. Keep README's verified previous kit link
until that kit's independent publication is complete.
