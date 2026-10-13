# ZeroHub public hosting

Owner authorized public availability on 2026-10-12, selected PostgreSQL and explicitly requested provisioning Neon through Vercel. Use the existing Zero Vercel project and its Marketplace integration; no separate Neon account/CLI login is needed.

## Public stages

The first hosted stage is the catalog at `/hub`: previews, contributor credit, exact imports and downloadable Maven artifacts. Vercel serves it through a read-only Node runtime backed by Neon. Auth, reservations and uploads stay closed server-side; missing capabilities also hide authoring controls. No Java runs in Vercel.

Full contributor uploads require the still-outstanding independent checker acceptance, a separately hosted isolated execution environment, GitHub OAuth, quotas, monitoring, backup/removal controls and explicit worker activation. The earlier provider-rejected checker review is not replaced by this hosting review. Do not retry/bypass that assignment or describe closed staging as a fully operational contribution service.

## Active contribution goal and sequence

Owner set this goal on 2026-10-12: students sign in with GitHub, prepare and
upload a component library, see clear minimum-check feedback, and receive an
immutable Maven release with authenticated contributor credit when checks pass.
Browsing, imports and exact version pins stay simple. No routine teacher or
maintainer package acceptance is added. The source-development review below
applies to Zero's implementation, not each student's library.

The owner approved [open contribution and curation](ZEROHUB-POLICY.md) on
2026-10-12. Drop lifetime per-contributor storage and library-count quotas; retain
technical/rate/queue controls and a shared capacity safeguard. Owners and
designated maintainers may archive or remove hosted content at their discretion.
Local source removes the 16 MiB cumulative account-source and 100 lifetime
reservation guards, retaining temporary rate/queue controls and the existing
shared source budget. Archiving/removal are deferred by the owner's next
instruction to prioritize proving the student flow. Final global/artifact/result
numbers and hosted activation remain separate requirements.
See [the ordered follow-up](ZEROHUB-PLAN.md#curation-and-capacity-follow-up).

| Phase | Exit evidence | Current state |
| --- | --- | --- |
| Admission and authentication housekeeping | Concurrent requests cannot exceed account/global limits; duplicate exact-source requests still work; expired sign-in material is removed in bounded batches with restricted credentials. | Local checks/source review complete; public capability remains closed. |
| Public API and GitHub identity | Review and test a bounded request/cookie adapter, OAuth success/cancellation/replay/account changes, and ownership checks. Register the production application and store credentials privately only after its settings and integration are reviewable. | Local OAuth and authoring adapter/authentication budgets passed source review and local checks and CI38300981955; closed-download follow-up reviewed and CI38302470684 passed. App/hosted auth not provisioned or enabled. |
| Isolated checking and publication | Obtain permitted independent checker acceptance; provision the execution host; verify candidate isolation, time/resource limits, one concurrent check, immutable image policy, role separation and separate publication. | Held by the existing review gap; no equivalent rejected review retries. |
| Operations and student proof | Artifact/result storage limits, bounded catalog/polling, alerts, independent backup/restore, withdrawal controls and kill-switch proof; real sign-in through corrected/failed submission to published exact-version reuse. | Exact lookup, bounded polling/discovery, finite workers and private backup tools are locally reviewed. Withdrawal/event-preserving backups are locally verified and independently reviewed. Artifact/result budgets, hosted backup/cache-removal policy, alerts and full hosted journey remain required. |
| Public activation | Reviewed source and required CI pass; deploy with uploads initially closed, verify production configuration, then explicitly activate and verify the full student journey. | Catalog stays available throughout; PR26 remains draft. |

Vercel remains the web/API host and Vercel-managed Neon remains the database.
Extend the existing server-side adapter deliberately for authoring; its present
read-only behavior must remain the default. Submitted Java never runs in the web
process. Keep checker and publisher credentials out of that process, and keep
OAuth credentials out of workers. No additional database account connection or
student repository permissions are needed.

Prepare GitHub application settings with name **ZeroHub**, homepage
`https://zero.codepet.ca/hub` and callback
`https://zero.codepet.ca/api/hub/auth/callback`. Use the existing `read:user`
identity flow without repository/email scopes or storing GitHub access tokens.
The accepted local hardening phase adds S256 PKCE alongside the existing one-time
state/browser binding, constrains upstream response sizes and deadlines, and
clears temporary authentication material. This is not a claim of real hosted
authentication. See
[GitHub's authorization contract](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

The existing Docker checker requires a deliberately configured Linux execution
host; it is not a drop-in Vercel Function or ordinary container service. Select
and price the host after resolving the acceptance route, and present any paid
provisioning for owner approval. A per-job VM design would require a new executor
integration and its own review, not satisfy or bypass the old source gate. Fly's
[isolation model](https://fly.io/security/) and
[Machine API](https://docs.fly.io/machines/api/machines-resource) are options to
evaluate at that point; no provider or paid host has been selected.

The goal remains incomplete until the actual production contribution journey
passes. Local tests, identity mocks, maintained seed publication and catalog-only
deployment each establish their own narrower evidence.

## Database and credentials

The `zerohub` Neon resource is created on Vercel Marketplace's free_v3 plan, region iad1, built-in Neon auth disabled. Vercel owns the resource connection and credential delivery. Existing pinned pg and PostgreSQL transactions/JSONB/BYTEA are retained. Immutable object bytes live in Neon initially; an object-store adapter can be introduced when justified by measured storage/traffic.

Vercel's generated integration connection is an administrator. Connect those integration variables to development only; pull them privately for migration operations. Do not include them in public production/preview deployments. The production catalog receives only `ZERO_HUB_API_DATABASE_URL`, using a distinct minimal login granted hub_api and a direct/unpooled URL. Startup role/timeout settings require a direct connection; pooled Neon endpoints are rejected. All credentials stay out of Git and tool/chat output.

Migration owner, API, checker and publisher use separate roles/logins. NOLOGIN group roles, column grants and immutable/status triggers are defined in hub/sql. API cannot create results, releases or stored objects. Checker cannot publish; publisher cannot change verdicts/lease work or authenticate. Runtime startup verifies actual login authority; SET ROLE on an owner connection is not isolation.

## Vercel runtime

- `ZERO_HUB_EMBEDDED=1`: use the read-only server-side runtime; no external API host is needed for the catalog.
- `ZERO_HUB_ORIGIN=https://zero.codepet.ca`: exact public origin.
- `ZERO_HUB_API_DATABASE_URL`: restricted connection, never a fallback to the integration owner URL.
- `ZERO_HUB_URL`: optional existing fixed-destination proxy for local development or a separately reviewed full hosted service; not required by the embedded catalog.

The embedded runtime uses bounded pools, no browser session/cookie forwarding, explicit unavailable checker/publisher functions and no runtime DDL/background workers. JSON reads are capped at4MiB, previews at256KiB and immutable Maven objects at16MiB in the reviewed local follow-up; larger Maven GETs stream with uploads both closed and enabled. It reuses the existing HTTP catalog/artifact contract; source edits remain ordinary Java and Maven versions stay exact.

The new contribution adapter is a local prerequisite, not enabled in production.
With `ZERO_HUB_UPLOADS` absent or0 it delegates to that existing read-only runtime.
Explicit1 additionally requires the exact HTTPS origin, restricted API connection
and OAuth configuration; known owner/other-role and prefixed integration variables
are refused. It forwards only the two hub cookies, Origin and CSRF headers.
Enabled origin aliases, ambiguous routes/queries, compressed/invalid JSON and
cancelled requests are rejected before handler dispatch. POST input is1MiB with
a5-second body deadline. Multiple session/temporary cookies are preserved.

Next's declared lifecycle is60seconds; the authoring pool has2 connections,
3-second acquisition and1.5-second SQL statements, allowing sequential15-second
provider requests without racing a handler that may still be mutating. These
tighter SQL deadlines can reject load and have not been measured on hosted Neon.
JSON is bounded4MiB, previews256KiB, Maven16MiB. Validated Maven GET bytes stream
in64KiB chunks after stored-byte verification, with cancellation releasing the
buffer. Vercel recommends streaming when a response exceeds its buffered4.5MB
limit; actual hosted streaming and HTTPS cookie/timeout proof remain required.
See [Vercel's response-size guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).

Authentication records have separate transaction-serialized budgets:1000 pending
OAuth states,2000 retained states,8 live sessions/account and10000 retained
sessions globally. Starts prune at most50 expired states; session creation prunes
at most100 expired sessions. A successful sign-in rotates only this browser's
previous session in the same transaction. Failed/cancelled sign-ins retain it.
The separate cleanup job shares the state/session admission locks in a fixed
order. These record bounds do not provide edge/IP request-rate protection or
limit persistent users/artifacts; those remain operating requirements.

Separate Node entrypoints prepare migrations, checking and publication. Workers require their own login, explicit enable flag and no OAuth/other-role environment credentials. The Docker runner still needs a deliberately provisioned Docker-compatible isolated host; a container-based deployment alone is not that host.

## Operations and release

Run website tests/types/build, actual PostgreSQL role/integrity/HTTP tests, local read-only browser proof and existing local enabled-library integration proof before source review. Publish through a reviewed feature PR and verify the actual public catalog, closed authoring endpoints, artifact hashes and Maven consumers. Keep known maintained seed source separate from unreviewed public uploads; never copy demo identity101/zero-local-demo into production attribution.

The maintainer-only `scripts/bootstrap-hub.mjs --preview <actual-preview.png>` publishes the fixed maintained Starter UI source/version. It obtains contributor identity from authenticated `gh api --hostname github.com user`, verifies separate API/checker/publisher logins, and selects only its own exact submission/source digest. It never drains a queue, starts an HTTP listener or enables public workers. Existing exact releases are verified and reused; changed source or preview cannot overwrite the version. Provide role-specific database URLs privately, never as command arguments. Local proof: `node --test scripts/bootstrap-hub.test.mjs`; the optional `ZERO_HUB_BOOTSTRAP_DOCKER=1` proof uses a disposable database and the actual maintained-source checker. This proof does not complete the excluded public checker-security review.

Deploy only a clean snapshot of the reviewed tracked source. `.vercelignore` excludes private verification, credentials and generated build caches; confirm the actual `vercel deploy --dry --format=json` source list before uploading. Production contains the API URL only, never bootstrap checker/publisher or migration credentials.

Neon free-tier restore/compute/storage limits are not a backup policy. Before uploads open, establish independent private exports and test restore, expired-session cleanup, one concurrent checker, temporary per-account/global queue controls and shared storage capacity safeguards, pagination, queue/error alerts, a kill switch and append-only withdrawal controls. Do not enable unlimited polling and assume an idle database still sleeps.

Local operator backup/restore tooling uses consistent private data snapshots and
transactional import into a freshly migrated empty database, preserving exact
library/source/result/object/sequence identity while clearing temporary sign-in
state. Trusted PostgreSQL17/18 schemas are pinned separately; archives contain no
executable SQL. See [private operator backups](../hub/service/README.md#private-operator-backups).
A read-only hosted Neon18 export using trusted prior018e3ab/format1 was restored
into disposable local PostgreSQL18 and re-exported byte-for-byte, then upgraded
locally through004/format2. This creates one private local copy, not an encrypted
retention policy, recurring export or hosted recovery/cutover proof. Those remain activation
requirements. Workers now default to finite batches; hosted triggers and one
checking process remain unconfigured.

Local operating-control follow-up selects artifact releases by their primary key before verified stored-byte reads; malformed filenames cause noSQL. Status polling has one job/account budget,2–15second backoff,5-minute/25-attempt automatic cap,15-second response deadline, hidden/offline cancellation and one-shot manual Refresh. These are source/fixture checks, not hosted throughput/rate protection. Catalog discovery now returns at most20/2MiB per page, searches all latest releases and retains separately paginated immutable history. Exact release lookup remains available with uploads closed. The editor limits history downloads to500 releases/16MiB/30seconds; overflow gives website/manual instructions without truncating pins.

Operating/discovery code through3b16089 has completed independent review and local verification. CI38303525610 and38304468383 passed earlier reviewed heads; CI38305503824 passed for3b16089. Finite-worker CI38310573906 and backup CI38312319015 also passed. The local browser used inert fixture metadata/demo identity and no Java execution. Public deployment remains unchanged; result/artifact quotas, hosted backup/cache-removal policy, alerts, real OAuth and isolated-host acceptance remain prerequisites.

Append-only release withdrawal is now locally verified on PostgreSQL17/18,
independently accepted at70264f7 by Astra/high and Sol/high reviews with no findings. The trusted004 migration must precede deployment
of the new API and format2 backups preserve its private audit events. Exact
withdrawn metadata/artifacts/checksums return410/no-store without stored-byte
reads; listing omits them, restoration resumes identical hashes, and pins never
change automatically. See [release availability](../hub/service/README.md#release-availability).
No hosted migration or withdrawal has occurred. Existing metadata/object edge
TTLs, browser immutable caching and local Maven copies prevent immediate global
revocation; a verified hosting removal procedure remains a separate gate.

Local public cache responses now carry a bounded library tag and a catalog tag,
enabling targeted foreground deletion after an operator event. Existing privacy,
TTL, exact-version and browser policies are retained. Runbook and native command
are in [cache removal](../hub/service/README.md#remove-cached-library-responses).
VercelCLI54.17.2 accepted these two tags for the verified Zero project; public
maintained JAR bytes stayed identical. Current deployed code predates tagging,
and the before/after probe was MISS→HIT, so it proves operator permissions, not
tagged cache-hit removal. Do not infer the activation gate is passed. New tag source4077dd8 passed one independent Sol/high review with no findings
and CI38318782410; deployment remains held; cached metadata/object withdrawal/expiry and
client-copy limitations still need the specified hosted drill after other gates.

The owner's question about an independent review task is a clarification, not
permission to repeat the provider-rejected checker assignment. A qualified
external human can review that unchanged boundary without routine student
acceptance work. No such reviewer or completed report is currently supplied.

The next operating prerequisite is a bounded once-only aggregate health report
and disabled daily repository health-test workflow, not a new student UI or
public endpoint. It uses the restricted API identity in a read-only snapshot,
reports existing-budget pressure/backlog/stale leases/infrastructure errors and
keeps public logs to fixed warning codes. Ordinary failed student tests are not
an infrastructure alarm. Object bytes are measured without enforcing proposed
new quotas. Source1cda139 passed complete independent Astra/high privacy and
Sol/high compatibility reviews with no findings. A local Mac read-only report
against existing hosted Neon/API credentials returned ok/no warnings in1463ms;
this does not verify GitHub-runner connectivity or scheduled delivery.

The workflow is limited to this repository's approved `main`, with no PR trigger,
an explicit disabled-by-default variable and separate operations environment.
No environment/secret/enable variable is configured. After source review,
deployment-branch policy and restricted login must be inspected before separately
authorized setup/activation. Actual connectivity, failure notification delivery
and schedule timing remain gates. GitHub's standard public-repository runners
are free, but provider eligibility/schedule limits apply; this is a bounded test
of this software project, not hosting for arbitrary uploaded Java. See
[the operator health guide](../hub/service/README.md#aggregate-health-checks).
