# ZeroJams local verification and operator setup

ZeroJams is default off. This document describes setup prerequisites, not
authorization to activate a service or change a GitHub App. The
[plan](ZEROJAMS-PLAN.md) defines architecture, ownership and delivery acceptance.
Do not use local fixtures or passing mocked tests as evidence of live acceptance.

## Local work

The canonical full creator website lives in `jam-template/`. The downloadable
ZIP is produced by `/api/jams/template?type=game` or `?type=app`; it contains an
independent editable copy, including event configuration and hosting workflow.
No separate public GitHub template repository is assumed. Creators customize the
copy, create their own repository and publish from their account. Templates have
no secrets. Updating Zero does not upgrade an existing creator's copy.

Use Node22 and the repository's pinned dependencies:

```sh
npm ci
npm ci --prefix website
node --test jams/test/*.test.mjs website/tests/jams-*.test.mjs website/tests/jam-*.test.mjs
npm run typecheck --prefix website
npm test --prefix website
npm run build --prefix website
npm run check
```

Website development uses `npm run dev --prefix website -- --port 3025` for an
isolated preview. With no configuration, ZeroJams shows truthful unavailability;
template downloading and preparation remain accessible. Tests inject disposable
stores and intercepted GitHub responses. No production GitHub writes or accounts
are required. The creator site is a static site and can be served independently
to verify its relative paths and editable source copy.

## Configuration boundary

Activation needs explicit owner authorization, existing website browser-auth
configuration, a reviewed GitHub App installation, and all of these server-only
values supplied through the deployment's secret/configuration system:

| Setting | Purpose |
| --- | --- |
| `ZERO_JAMS_ENABLED=1` | Explicit activation; unset disables all registry actions |
| `ZERO_JAMS_MAINTAINER_IDS` | Comma-separated numeric GitHub account IDs permitted to review and moderate |
| `ZERO_JAMS_APP_ID` | Numeric ID of the reviewed service GitHub App |
| `ZERO_JAMS_INSTALLATION_ID` | Installation belonging to `codepetca` with approved repository access |
| `ZERO_JAMS_PRIVATE_KEY` | RSA private key for server-only installation-token minting |

The service mints short-lived installation tokens narrowed to `codepetca/zero`
with Contents write and Metadata read. Its process-local cache reuses tokens for
at most ten minutes, stopping reuse before token expiry. Browser user credentials
remain separate and verify participant identity/source access. No participant
token is a fallback registry credential. There is no custom token-entry form.
The code does not register an App, modify its permissions, select repositories,
provision a branch or set deployment secrets.

Review whether a dedicated App or the existing shared App is appropriate before
activation. Its private key is consequential authority even though issued jam
tokens are narrowed; account owners must approve the actual installation and
permission scope. Do not grant all-repository access or silently add scopes.

## Registry and privacy

Official state uses the dedicated existing `zero-jams-registry` branch in
`codepetca/zero`, with one `jams/<event-id>.json` file per event. An operator must
provision and validate the branch separately after authorization. It is not the
game/library sharing branch. Initial absence is an error, not permission to write
to main or create another destination. The writer must have access only through
its reviewed service configuration; creators cannot write official records.

This MVP is public: registrations use GitHub IDs/handles and entries use public
repository references. Do not store emails, private rosters or sensitive review
material in the branch. Website routes hide pending proposals from ordinary
browsers, but that is a UI/API boundary, not secrecy from readers of the public
Git branch. Review conversations and proposals must therefore also contain only
public-safe information. Withdrawal updates current display, not Git history.

One repository identifies one event. Reusing a repository for another event or
transferring organizer authority is not an automatic rename operation. Review
the migration/transfer explicitly, retaining accepted event and participant IDs.

## Capacity, recovery and suspension

Pilot event/participant/operation/history limits are deliberately bounded; exact
values are in `jams/schema.mjs`. Per-event limits are enforced in atomic updates.
The global event-count admission check is advisory under simultaneous new-event
creation: different event files do not share a quota transaction. Listing fails
closed above its configured bound. A strict global quota needs a shared index
reservation and is not claimed by this MVP.

Every accepted write records an idempotent operation result with its state.
After a timeout, retry the same request identity/payload to recover the result;
do not invent a new success or manually replay it with another operation key.
Conflicting changes require a fresh review. Deadlines are checked by the service
on current authoritative state; stale public summaries never authorize writes.

The public discovery cache is bounded to thirty seconds per warm server instance.
There is no workflow dispatch or full-site rebuild per join. Ordinary writes
read GitHub and conditionally update their exact event file. GitHub outages,
capacity or quota errors preserve drafts and refuse false success. Existing
accepted results can be recovered after a deadline; a new late action cannot.

For an event incident, a maintainer can suspend or cancel through the reviewed
event controls. For platform trouble, disable `ZERO_JAMS_ENABLED`; this stops
official reads/writes and leaves creator websites independently hosted. Preserve
Git history and source when investigating. Re-enable only after verifying the
cause, effective permissions and affected records.

Before expanding the pilot, record requests/GitHub calls per action, latency,
cache behavior, conditional-write conflicts, storage growth and moderation time.
Choose explicit provider spending/usage limits under owner authorization. GitHub
API limits, hosting plans and free allowances are dependencies, not permanent
unlimited service guarantees. Private events, large events or sustained write
contention require another design review.

## Live acceptance still required

After source review and authorized deployment, verify actual GitHub consent,
installation token scope, source ownership, registration, retry recovery, deadline
closure, withdrawal, suspension and gallery visibility with real pilot accounts.
Verify creator-hosted embedding, top-level sign-in fallback, mobile/desktop
browsers, and measured provider use. Keep physical OS/browser and school-network
gaps explicit. Passing local HTTP, source and browser fixtures is not this live
acceptance and does not authorize publication.
