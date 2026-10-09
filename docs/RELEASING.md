# Releasing Zero

`release/kit.json` is the release source of truth. Published versions and their
asset bytes are immutable. A release has exactly three public assets: the complete
kit, standalone starter and versioned VSIX. Optional component archives stay local.
The workflow prepares review artifacts with read-only GitHub permissions; it
never creates a tag, release, deployment or account credential.

## Prepare a new version

1. Create a feature branch from current `main`. Choose an unused numeric version
   such as `0.5.2`; never replace the bytes of an existing version.
2. Update `kitVersion`, `publication.tag` (`v0.5.2`), and the extension filename
   (`zero-0.5.2.vsix`) in `release/kit.json`. Set `publication.status` to `local`,
   retain the canonical repository, and remove prior `url`, `size` and `sha256`
   values from the three main asset definitions. Keep optional components local.
   Match the version in `extension/package.json`. Change `coreVersion` and its
   canonical POM references only when the core actually changes. The website
   package's version is independent; its downloads come from the release manifest.
3. Open a draft PR. **Release checks and preparation** runs configuration,
   extension/starter tests, finite JavaFX examples under Xvfb, website checks,
   packaging and exact archive/source/license/integrity verification. Published
   manifests still run checks but skip packaging and upload. No push or tag
   triggers automatic publication.
4. Complete independent review and required CI before merging the source PR.
   Then run the workflow manually on the reviewed source ref, entering its exact
   new version. The manifest must still be local. Existing tags/releases, wrong
   versions and unavailable GitHub absence checks stop preparation.

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
Record the release URL, target commit, run ID and public download verification in
the existing handoff. Future improvements start with another new local version.
