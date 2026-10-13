# Sharing operations

Use [the adoption plan](GITHUB-SHARING-PLAN.md) and
[shared contract](../sharing/CONTRACT.md). The replacement source is merged; public game delivery is proven while
general publication remains disabled during Mac rollout. Generic library publication is closed pending the actual outstanding
managed execution acceptance. The game path only packages source.

## Before activation

Review the exact source revision and verify actual public Blob delivery, ETags,
immutable collisions and cleanup with approved inert files. Provision the fixed
`codepetca/zero` branch `zero-sharing-registry` and `registry/state.json` explicitly
from `node sharing/cli.mjs setup` / `registrySetupDocument()`; the application
never creates a branch or resets a missing registry. Its initial state contains
no releases and an inbox cursor at page 1, offset 0. Because this is a data-only
branch, add `website/vercel.json` there with `git.deploymentEnabled: false` so
registry commits do not trigger website builds. Keep that file in registry backups.

Configure a dedicated publisher environment and selected public Blob store. Keep
`ZERO_BLOB_TOKEN` private. GitHub's workflow token supplies registry write and
source read, with checkout credentials disabled. No candidate Java receives any
of these credentials. Do not add a website write token or OAuth application.

The reviewed configuration has these fields:

```json
{
  "schema": 1,
  "repository": "codepetca/zero",
  "registryBranch": "zero-sharing-registry",
  "artifactOrigin": "https://YOUR-STORE.public.blob.vercel-storage.com",
  "policyRevision": "EXACT_REVIEWED_SOURCE_COMMIT",
  "gamePublicationEnabled": false
}
```

These uppercase values are placeholders, not valid runtime configuration. Use
the actual store origin and 40-character lowercase source SHA. Set the reviewed
JSON as `ZERO_SHARING_CONFIG`. Its `policyRevision` selects the publisher checkout;
the workflow validates the exact Git HEAD and full configuration before exposing
publication credentials. Routine default-branch documentation or release metadata
changes do not rotate this pin. Changing publisher policy/source requires an
explicitly reviewed pin and matching student settings. Keep
`ZERO_SHARING_GAME_PUBLICATION_ENABLED` absent/false until rollout checks pass;
then deliberate activation requires both that variable and the validated config.
Website settings are documented in [its README](../website/README.md).
The kit reads checked `release/sharing.json` with the same public origin/policy and
canonical website catalog URL. Review that file with publisher pin changes; its
exact bytes are included in local/CI packages and verified before publication.
It contains no publisher token.

## Dry runs and recovery

```sh
node sharing/cli.mjs status --config /path/to/reviewed-config.json
node sharing/cli.mjs prepare --config /path/to/reviewed-config.json --issue 123
node sharing/cli.mjs publish --config /path/to/reviewed-config.json --issue 123
```

These commands do not publish by default. After authorized activation, writes
also require `--execute --role publisher` and private publisher environment
credentials. `reconcile` recovers durable requests and accepted delivery;
`deliver --release game/game-r12345-my-game/0.1.0` targets an exact accepted
release. Closing an unaccepted issue cancels it; closing an accepted request
does not withdraw its artifact. An accepted version cannot be reassigned.

Periodic issue events may be replaced in GitHub's pending queue. The dedicated
ledger and inbox reconciliation are the recovery mechanism. Follow explicit
paused/capacity status rather than deleting requests or loosening limits. The
publisher processes queued work first, checkpoints each inbox item, and stops
new work at a 15-minute wall budget with 30-second source operations. It resumes
the saved position on the next run. Previously frozen unchanged requests avoid
refetching every source blob. These limits allow partial progress within the
25-minute job; they do not promise provider latency or capacity.

For an infrastructure-paused game, use `retry --request <64-character-request-id>`
with the same explicit publisher execution flags. This never replaces an accepted
release or activates library checking. `withdraw --release <exact-release-key>`
and `restore --release <exact-release-key>` change catalog availability while
preserving the reservation and bytes. Both default to dry runs. Students can
check their official issue link on `/hub/share`; results disclose frozen source
status, and available links require the accepted record and catalog to agree.

The
global registry is bounded to 8 MiB and catalogs to 4 MiB / 5,000 releases; these
are practical pilot ceilings, not an unlimited scaling claim. Inspect growth and
API consumption before adding cohorts. Frozen source currently uses Git blob
reads per file, so source size and repeated reads matter as much as student count.

## Backups, withdrawal and retirement

Back up both the authoritative Git registry history and every accepted final
object and catalog snapshot it references. Hash and size verification must pass
before declaring a backup usable. A Git mirror alone does not back up Blob bytes.
Test restoration into an isolated destination; never overwrite a live accepted
coordinate to perform a drill. A live provider backup/restore drill and retention
policy remain rollout requirements; fixtures do not establish provider recovery.

Availability changes preserve accepted identities and byte hashes. Retain an
audit record and show unavailable status; never silently choose another version.
Only explicitly eligible temporary staging objects may be cleaned by the new
adapter after verification. Final-object deletion is a separate owner decision.

The former Neon runtime is removed from source. Inventory old hosted resources,
export useful data and decide retention before separately authorized retirement.
Local code cleanup has not deleted the hosted database, credentials or published
experiment artifacts. Preserve all existing immutable kit and artifact bytes.
