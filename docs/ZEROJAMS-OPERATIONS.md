# ZeroJams local verification and operator setup

ZeroJams is under an owner-requested production visibility hold. Production always
returns404 for `/hub/jams` descendants and `/api/jams`, including panels and template
downloads. Credentials or pilot flags cannot lift that hold. Public navigation and
unreleased editor shortcuts stay hidden/deferred.

Local development remains available. The owner-authorized protected pilot admits
only stewchan and armorup at the fixed Preview project/branch/origin. Production
is still closed. See the [pilot packet](ZEROJAMS-PILOT.md) for the current deployed
revision, exact operator steps and separately unproven expansion acceptance.

The underlying service is also default off. This document describes setup prerequisites, not
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

Normal public activation still needs a separately reviewed production-hold change.
An invited preview pilot keeps production closed and follows its narrower operator
packet instead. Both need explicit configuration/deployment authorization, browser
auth, a reviewed service installation and server-only values through the secret
manager. Pilot settings must be scoped only to its exact preview branch; no
production secret changes are needed. The service settings are:

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
`codepetca/zero`, with one `zero-jams-v2/events/<event-id>.json` file per event after the explicit
atomic-registry migration. `jams` becomes an exact regular-file protocol marker;
`zero-jams-v2/settlements.json` contains bounded rejection fences. An operator must
provision and validate the branch separately after authorization. The prepared
pilot instead selects only `zero-jams-pilot-registry`. Initialize that as a state-only
orphan branch, with any README outside legacy `jams/`; do not branch from main, whose
`jams/` directory contains service source rather than event records. There is no
fallback between pilot and normal registries. It is not the
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
The atomic registry pins event-count admission and each commit to one branch
snapshot, so simultaneous different-event creations share the quota transaction.
The legacy per-file adapter did not provide that guarantee. Listing still fails
closed above its configured bound. This is a bounded pilot, not a load-tested
database or a provider-capacity promise.

Participant and ordinary administrative writes cannot consume the reserved
safety operation/storage pool. Suspension, cancellation and entry removal use
bounded separate slots with short public reasons and compact source-referencing
withdrawal records; the original source revision stays in history. This reserve
is finite and is not an unlimited audit log. If operator-driven safety history
itself reaches capacity, preserve records and disable participation while planning
an authorized capacity/schema change. Ordinary participants cannot spend it.

Every accepted write records an idempotent operation result with its state.
After a timeout, retry the same request identity/payload to recover the result;
do not invent a new success or manually replay it with another operation key.
Conflicting changes require a fresh review. Deadlines are checked by the service
on current authoritative state; stale public summaries never authorize writes.

Use **Resolve earlier request** to retry the same action. If the request cannot
be completed, **Close earlier request** atomically recovers its accepted result
or durably prevents it from applying. This does not undo a completed Join or
submission; review current details afterward. A lost close reply/reload keeps
closing, even if the event becomes eligible again. Closing mode and operation ID
are one saved value; if recovery storage cannot be confirmed, Zero sends no new
request and explains that storage must be made available first. Keep drafts and do not manually
clear keys or invent fresh ones until the outcome is confirmed. Authentication,
provider failures and exhausted settlement capacity retain the pending request.

Fences have separate limits (1000 total,50/account,512000 bytes,10 new/account/
minute), protecting ordinary and reserved safety capacity. They are never evicted
to free space. At exhaustion, stop that flow and plan an authorized capacity or
protocol transition. No cleanup script may discard fences.

Explicit pilot migration: run `node jams/migrate-registry.mjs --plan`, inspect the
fixed branch/head, event blob hashes and deployment guard, then within applicable
owner authority run `--apply --expected-head=<planned SHA>`. The CLI uses the
existing GitHub CLI session without exporting credentials. New runtime fails
closed until migration; expect a brief controlled-preview maintenance interval.
The planned head is enforced through publication; drift/conflict aborts and
requires a fresh plan. Migration copies event bytes and preserves unrelated files/history. Record the
new head and matching file/guard hashes. Never roll back to the old Contents
writer or recreate `jams/`; disable the pilot if a rollback is needed and retain
the v2 ledger/marker. Production and all invitation/App/secret settings stay held.

Non-pilot anonymous discovery caching is bounded to thirty seconds per warm server
instance. The invited pilot disables that public cache and checks current invitations
before each route read.
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

## Provider efficiency and pacing — 2026-10-26

Current local implementation reduces duplicate immutable reads while preserving
fresh authority and exact CAS publication. Every new request/snapshot verifies
head, marker and ledger; listing reads one pinned snapshot. A private issued-base
cache is usable only after a fresh matching head, and invalidated on publication.
It is not a stale authority cache or an alternate write path.

Five deterministic fixture runs agree on the unpaced service comparison below.
These are request budgets, not live latency/throughput claims. The new regression
also measures the enabled two-event pilot admission separately.

| Operation | Previous GitHub calls | Optimized calls |
| --- | ---: | ---: |
| Join / approve | 27 | 13 |
| Submit | 29 | 15 |
| New proposal, empty registry | 25 | 14 |
| Accepted retry / event read | 8 | 8 |
| New event settlement | 19 | 13 |
| List two events | 23 | 9 |
| Two synchronized distinct Joins | 73 | 39 |
| Eight forced conflicts (generic test only) | 160 | 104 |

Pilot-wide admission reads both bounded events. With two events, successful Join
or new settlement uses14registry calls (10GET +4write-method calls); a warm web
Join plus current identity and event refresh uses23calls. Submission adds2source
calls. Cold installation setup adds2calls, coalesced within a process. Staged
objects and rejected ref writes still consume provider work without a published
commit. Pilot GETs do not use stale projection caches; there is no timer polling.

Hosted pilot policy now enforces accepted-intent caps across actors/events using
records in the same branch CAS, with no extra quota writes or new database:

| Pool | Per minute | Per hour |
| --- | ---: | ---: |
| Ordinary changes | 2 | 20 |
| Safety moderation | 2 | 10 |
| New request closures | 2 | 10 |

Existing accepted results/fences recover before admission. A CAS loser reloads
counts; clock rollback over30s blocks new work. Safety and closures have separate
capacity. Runtime permits only2 CAS attempts, with 100–400 ms conflict jitter. These
caps cover cooperating new writers of this branch, not reads, rejected staging,
older code or a hard installation-wide request quota. Retain current invitations.
Do not restore an older writer to bypass a wait; resolve the same request later.

The process-local monitor observes actual installation response headers, preserves
ordinary-write headroom of max(100,10%of limit), and keeps a32-request floor for
safety/recovery writes. Above-zero reads can recover accepted results. Recognized
403rate refusals/429 immediately return503/Retry-After, without transparent HTTP
retries; generic403 is not mislabeled throttling. Two provider failures open a
15s circuit. Installation requests share at most4in-flight bodies; write starts
are1s apart, local queue≤4s, and the HTTP operation has an18s context deadline
in addition to individual8s provider signals. A timeout can still follow a commit:
keep operation keys and recover/close, never assume it did not apply.

### Maintainer visibility

Open `/api/jams/provider` on the protected pilot while signed in as armorup.
It checks the current GitHub identity and refuses ordinary participants before
provider access. Production and uninvited origins remain hidden. It returns
header-derived installation limit/remaining/used/reset/resource and observed time/
staleness, plus separately labeled process counters and per-request call counts.
Null/unknown is never zero. Its installation `/rate_limit` probe is read-only,
coalesced and limited to once per30s per process when an observation is needed.
Other processes have separate caches; never call this a fleet counter or poll it
rapidly. The operator CLI's user quota and public IP bucket are not substitutes.

One safe `zerojams-provider` log summary per official API operation records method
counts, duration, status, scoped counters and installation/setup quota metadata.
No form, actor, operation ID, URL, credential or personal participant quota is
persisted by this logger. Hosting provider logs/retention are separate; see the
privacy source inventory. Inspect Retry-After/reset rather than hammering Retry.

GitHub documents at least5000installation requests/hour plus secondary limits;
4write-method requests per accepted update remain relevant. Some endpoint costs
are undisclosed, so these controls are conservative mitigations, not an unlimited
capacity promise. [GitHub limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

### Hosting evidence and remaining cost gate

Read-only metadata confirms active Hobby/Fluid/iad1/Node22 and unchanged Preview
protection. The actual Zero project Usage dashboard's Last 7 Days view (displayed
Oct 19–26) shows roughly 2.4K function invocations,5m33s active runtime CPU,
0.36 GB-hours memory,85.02 MB transfer and11h42m build CPU. This includes production,
other Zero work and previews; it does not isolate ZeroJams. Dashboard usage is
rounded, not an invoice or marginal-price quote. The billing API returned404
Costs not found; actual incremental pilot spend remains unknown.

No paid feature, account spend setting, hosting plan, infrastructure provider,
credential or invitation was added. Native Vercel spend-management pause is not
a Preview stop. Keep a supervised two-account trial; verify plan eligibility and
Preview-specific spending controls before wider use. Current runtime measurements
show modest resource use, but do not establish school-scale cost or service levels.
[Spend management](https://vercel.com/docs/spend-management),
[billing API](https://vercel.com/docs/rest-api/billing/list-focus-billing-charges),
[plan conditions](https://vercel.com/docs/plans/hobby).

Keep the suggested60additional route loads/hour as a manual planning guideline,
not an installed request limiter. Stop new work on unexplained unknown outcomes,
repeated conflicts or provider refusal; preserve same-key recovery. Compare live
observations with the observed reset window before any expansion. Safari/mobile/
actual zoom remain owner-paused. Sponsor, merch and payment ideas are parked.

## Live acceptance still required

After source review and authorized deployment, verify actual GitHub consent,
installation token scope, source ownership, registration, retry recovery, deadline
closure, withdrawal, suspension and gallery visibility with real pilot accounts.
Verify creator-hosted embedding, top-level sign-in fallback, mobile/desktop
browsers, and measured provider use. Keep physical OS/browser and school-network
gaps explicit. Passing local HTTP, source and browser fixtures is not this live
acceptance and does not authorize publication.
