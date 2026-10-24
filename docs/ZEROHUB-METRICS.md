# ZeroHub interest and component adoption

## Plan and scope

Keep GitHub stars as explicit appreciation. Add two small measures:

1. Read direct published Zero library declarations from the immutable game POM
   already captured by the sharing publisher. Save a bounded observation with
   acceptance and derive **Used by N shared projects** from that ledger.
2. Record a **visit** (Play-link activation) when a ZeroHub image link is activated. Store one atomic
   integer per known playable project in an optional Redis REST counter.
3. Show these counts alongside existing feedback, test publication/recovery and
   browser behavior, then obtain separate authorization for hosted activation.

There is no new analytics SDK, student account, background scan, GitHub App
permission, extension telemetry or tracking code inside hosted games. Existing
stars and publication credentials keep their current boundaries. Native Zero
and Java APIs are unchanged. Source, tests and operational setup are local until
separately reviewed and published.

## What the numbers mean

**Visits** are best-effort Play-link activations from ZeroHub since activation,
including repeat opens. Primary clicks, keyboard activation and middle clicks
are recorded; opening through the browser's context menu or with JavaScript
disabled may not be recorded. They do not prove the destination loaded, unique
visitors, play duration or successful gameplay. Counter errors never delay or
cancel the ordinary direct link. The client sends only a project ID and omits
credentials. Counter records contain only project IDs and totals; Zero stores
no IP addresses, browser identifiers, cookies, accounts or event history for
this feature. Hosting providers may retain their ordinary request logs.

**Used by N shared projects** counts distinct numeric source repository IDs
declaring a library in current available shared game snapshots. Each game ID
uses its highest available version, matching catalog browsing; withdrawing it
falls back to an older available release. Several game IDs or versions in the
same repository contribute at most one use per library. Self-use in the
library's source repository is excluded. An exact dependency version must have
been accepted and delivered; a withdrawn dependency version can still count
when that library has another available version. Publication retries never
increment adoption totals.

Observations include direct exact Maven declarations from Browse/Add, authored
published libraries and manual snippets, with bounded property resolution.
Local source mode and copied Java are not measured. Unsupported or unresolved
POMs omit observations rather than blocking publication or claiming zero.
Declared dependencies do not prove runtime use or usefulness. Repositories are
public at acceptance; this feature does not monitor later visibility changes.

Older releases remain unchanged and have unknown coverage. The website shows
**Used by at least N shared projects** for positive partial counts, or **Usage
not measured yet** when partial coverage has no observed uses. The accessible
description explains how many shared repositories were measured. A complete
observed zero may show **Used by 0 shared projects**. No automatic backfill or
inspection of private/unshared repositories is added.

## Storage and compatibility

The optional `adoption: {schema: 1, libraries: [{id, version}]}` field belongs
to the accepted registry ledger entry, outside the strict public release.
Its digest is bound to trusted game-packaging evidence and it is committed
atomically with immutable acceptance. Recovery uses the accepted observation,
not the author's changing source. Legacy entries without it remain valid.
Strict catalog/release JSON and released clients remain unchanged.

The website's `/api/hub/metrics?kind=game|library&ids=...` endpoint accepts at
most 12 known IDs. Library counts are a read-only projection from the configured
canonical public registry; direct catalog staging configurations have unknown
adoption. Public responses and bounded process caches each last one minute, so
displayed counts can lag by about two minutes. Failed sources stay unknown.
The endpoint never returns registry request bodies or dependency lists.
The browser loads metrics in batches as cards approach the viewport, including
cards after the first twelve. Browsers without IntersectionObserver load all
selected cards in bounded batches. Existing site-check limits stay separate.

Play opens use `POST /api/hub/opens` with only `{"id":"drawing-pad"}`.
Writes require the configured same origin and a known playable game. The
handler accepts at most 256 body bytes and never accepts a destination URL.
Reads use one Redis `MGET` per uncached batch and each open uses one atomic
`INCR`; uncertain writes are not retried. The key prefix is
`zero:hub:opens:v1:`. There is no per-event Git commit or Blob write.

## Optional hosted activation

Configuration status, 2026-10-24: the owner accepted integration terms and
`zero-hub-opens` was created through Vercel on Free, with auto-upgrade and Prod
Pack explicitly off at creation, primary region iad1 and no read replicas.
Only Zero Production is connected. The Vercel dashboard confirms Free, 500K
monthly commands and Available. Credentials are injected automatically. The
reviewed application source still needs separate publication before real
ZeroHub opens are counted; no existing public totals were fabricated.

Component observation collection begins when the reviewed sharing publisher is
adopted through its normal pinned policy/configuration rollout. Deployment of
the website alone does not update the selected publisher policy. No registry
migration or historical rewrite is required. The website needs only its existing
canonical `ZERO_SHARING_REGISTRY_URL`; no GitHub write credential or new App
permission is needed.

Before any new observation is written, stop/drain old publication jobs and update
both game and library publisher pins to readers that accept the optional ledger
field. Old strict registry readers reject it; rolling back to those readers
after observations exist requires a compatibility patch, not deleting history.
The exact shipped `11c54518320b52a659104eaf01d685fe2dd93917` request policy is
supported for games and libraries with unchanged current admission checks.
Keep `release/sharing.json` and installed clients on that policy while advancing
both operator source pins together; see the [rollout guide](SHARING-OPERATIONS.md).

Owner constraint (2026-10-24): keep Redis free and configure it through Vercel.
In **Vercel → Storage → Create Storage → Upstash for Redis**, select **Free**,
disable **auto-upgrade**, leave **Prod Pack** off and use one primary region.
Connect only the `zero` project and only **Production**. Do not enable a paid
plan, a paid add-on or an automatic upgrade. At free limits, accept unavailable
counts while preserving Play. New integration terms require owner confirmation.

The native integration injects server-only `KV_REST_API_URL` and
`KV_REST_API_TOKEN`; source consumes this pair directly without an SDK or manual
credential copying. The integration can be provisioned before source publication;
its settings apply to a subsequent deployment, not the already running site.
For an explicit database override, set both variables below. A partial override
disables the store rather than mixing it with integration credentials:

| Variable | Value |
| --- | --- |
| `ZERO_HUB_OPENS_REDIS_URL` | Exact HTTPS database REST origin ending in `.upstash.io` |
| `ZERO_HUB_OPENS_REDIS_TOKEN` | Database REST write token; never `NEXT_PUBLIC_*` or Git |

Reuse the existing `ZERO_HUB_ORIGIN` (`https://zero.codepet.ca` by default).
Explicit `http://127.0.0.1:PORT` is supported outside Vercel for local tests.
Vercel Preview/development environments ignore counter credentials even if
copied. Missing or invalid counter configuration disables counting and hides
open totals; stars, adoption, browsing and Play remain available. Set
`ZERO_HUB_OPENS_DISABLED=1` to disable all counter credential sources without
deleting stored totals. Keep the database
on a capped/free plan if avoiding spend is the priority; ordinary website
function invocations still use hosting resources. Anonymous counts are approximate
and can be inflated by automated requests; same-origin checks are not bot proof.

At implementation time (2026-10-24), the provider lists one free database
and 500K monthly commands. Recheck eligibility and pricing before
provisioning; this is not an unlimited-free promise. No resource or credential
is provisioned by source changes. See [pricing](https://upstash.com/pricing/redis)
and the [REST protocol](https://upstash.com/docs/redis/features/restapi).

Activation acceptance: verify anonymous/middle-click/keyboard Play opens,
unchanged direct navigation with counter failure, durable totals after a new
server instance, preview isolation, and publication/update/removal of a library
declaration through the reviewed publisher. Hosted writes and provisioning
require owner authorization; local fixtures do not establish these results.
