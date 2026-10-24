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
of these credentials. Never add a website publisher/registry write token.
The optional [ZeroHub star connection](ZEROHUB-FEEDBACK.md) uses a separate
GitHub App with only user Starring permission; it has no publication authority.

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

## Manual game withdrawal

Maintainers can run **Sharing game publication → Run workflow** on `main`.
Choose `withdraw` and provide one complete accepted game release key, for example
`game/game-r12345-my-game/0.1.0`. Withdraw every available version to remove a
project from normal browsing. Each dispatch uses the existing publisher
credentials, configured source pin and serialized publication queue; it appends
availability history and refreshes the catalog without deleting accepted bytes.
Non-manual or non-main withdrawal, library keys, multiple keys and malformed
inputs are rejected before publisher credentials are passed to the action.
Leave the release field empty for ordinary `reconcile` runs. Operator withdrawal
requires the existing enabled publication gates. Inspect and back up the accepted
registry and objects before dispatch, then verify the exact run, catalog statuses
and unchanged accepted identities/artifact hashes. The `restore` CLI remains an
explicit operator recovery operation; it is not exposed by this workflow.

## Catalog visibility

ZeroHub browsing shows the highest available semantic version per project ID.
Older releases retain their existing exact-version links and immutable artifacts;
browsing no longer presents a card for each version. An older available release
can reappear if every newer release is withdrawn. For project removal, operators
withdraw every available version using the guarded command above; there is no
student removal UI. Withdrawal changes catalog availability, not existing public
Blob URLs or their cached bytes.

New game submissions require a committed square PNG screenshot (up to 2048 ×
2048 pixels and 4 MiB). Existing accepted releases stay readable without one.
Use Zero's Edit sharing details to choose the PNG path, commit and push it, then
share. New publisher validation takes effect only after deliberately promoting
the reviewed publisher source and its policy pin; a website deployment alone
does not change the pinned admission policy. The upgraded publisher accepts
released 0.5.19 game requests carrying the exact prior
`1b63ae6ce07f467ab4c4600d78507157ad3bdc7c` request policy. That compatibility
never skips current screenshot checks for unaccepted games. Frozen request and
release identity keep the client policy; trusted provenance records the actual
operator-selected publisher revision. Other stale pins and legacy-pin libraries
remain rejected. Existing accepted delivery and recovery preserve original bytes.

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


## Compatible rollback after linked-game admission

Once a frozen request or release contains a web receipt, keep a publisher revision
that can read it. The reviewed1b63ae6 publisher can read source-only and linked
records; the formerbeaaca4 contracts cannot. A rollback disables both
ZERO_SHARING_GAME_PUBLICATION_ENABLED and gamePublicationEnabled while retaining
the compatible publisher, current registry/history, final objects and catalog
snapshots. Never restore an older registry over accepted versions or delete final
objects. If necessary, append a withdrawal event for the exact release using the
compatible publisher; preserve the version reservation and source downloads.
Recheck the queue before rotating pins: retry does not migrate frozen old-policy
requests. Resume only after targeted repair/review and verify before/after hashes
of accepted objects against the retained backup receipt.

## Managed library pilot

The owner reopened checker acceptance on2026-10-17 for a real sample library.
Implementation is gated separately from games. Do not infer activation from
local Check, a source merge or a student workflow result. See
[the managed library contract](../sharing/LIBRARY-CHECKING.md) for phase gates.

`Sharing managed library publication` uses three jobs: trusted intake reserves
one exact queued request, the worker builds the pinned trusted image before
fetching candidate source and checks in offline containers, then the publisher
independently verifies official Actions provenance and immutable output hashes.
Only the publisher job receives the existing `zero-sharing-publisher` environment
and Blob credential. The worker's host may read public GitHub source with a
read-only workflow token; candidate containers receive no host credentials.

The separate repository variable `ZERO_SHARING_LIBRARY_CONFIG` has the same
canonical repository/registry/origin/source fields as the game configuration,
plus explicit `libraryPublicationEnabled` (default closed). The separate
`ZERO_SHARING_LIBRARY_PUBLICATION_ENABLED` variable must also be `true`.
Routine game configuration remains strict and separate. Before first library
intake, promote the game publisher to the compatible reviewed source and drain
old jobs: the independent optional `libraryInbox` cursor is unreadable to the
older publisher. Rollback disables both library gates and retains a compatible
publisher, registry/history and accepted bytes; never restore an old registry or
an incompatible publisher over accepted work.

The library workflow's source must exactly match the configured reviewed SHA.
The official main-branch workflow definition must match the reviewed definition;
document-only main commits do not require a policy repin. Publisher verifies run,
attempt, repository, workflow/event/ref, successful finished checker job, artifact
ID/name/ZIP digest, frozen request/source/commit/policy, fixed checker digest,
image/platform and each exact artifact hash. Passing requires every fixed stage.
Missing, cancelled or unverifiable output cannot accept a version.

Contributor source/check failures record fixed compiler/API/behavior/example
corrections. Infrastructure failures retry finitely and pause after three; the
ledger and periodic intake retain queued work after interrupted events. Accepted
delivery recovery uses staged bytes without running the candidate again. Existing
accepted coordinates and artifact bytes never change.

For an explicitly approved compatible client, its sharing policy must match the
library operator pin. Released0.5.19's compatibility exception remains game-only.
A local0.5.20 candidate supports browser builds from declared editable libraries
or exact accepted source artifacts, with no local-source fallback for a missing
published release. A pilot with that client does not update existing installers.

## Clear tutorial practice listings

The local source reserves `tutorial-credits-badge` for lesson copies. Ordinary
catalog APIs exclude those libraries; explicit practice discovery uses
`/api/sharing/catalog/practice` and `/hub?kind=practice`. No production activation,
cleanup or schedule is implied by this implementation. Library publication
remains separately paused until authorized acceptance/rollout.

Select exact practice release keys from the practice catalogue. Already-withdrawn
keys are accepted for safe retry. Preview up to 150 distinct keys with the reviewed library configuration (replace the
example repository ID/version/config path):

```sh
node sharing/cli.mjs library-practice-cleanup --config reviewed-config.json --releases library/lib-r12345-tutorial-credits-badge/0.1.0
```

This is a dry run. For an authorized cleanup of that same explicit selection,
append `--execute --role publisher`. Execution requires
`libraryPublicationEnabled: true`; it does not use the game publication gate or
turn library publication on. Multiple exact keys use a comma-separated list.
There is no implicit all-library deletion or automatic schedule. Review the
selection and obtain authority for live registry mutation before executing.

The operation rechecks the selected accepted records and availability state in a
CAS update, appends ordinary withdrawn events and regenerates the catalogue.
If withdrawal commits but catalogue publication fails, rerun the same exact-key
command: already-withdrawn keys are rechecked, no duplicate withdrawal event is
added, and catalogue publication is retried. A stale selection during execution
must be reviewed again. Ordinary community libraries are
rejected. Withdrawing all available versions removes the practice entry from
discovery; withdrawing only the latest can reveal an older still-available
version. Exact withdrawn-version views retain their status.

It removes no student GitHub repository, source, accepted artifact or registry
history. Existing downloaded/copied bytes stay in student projects/caches.
Future Add/Update/Revert, fresh fetching and browser export still enforce the
normal availability/integrity requirements; do not promise that a withdrawn
release can always be resolved again. To restore an exact version, use the
existing explicitly authorized restore flow with the appropriate enabled
publisher configuration. Clearing listings does not authorize artifact deletion.
