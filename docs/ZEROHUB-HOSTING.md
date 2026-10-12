# ZeroHub public hosting

Owner authorized public availability on 2026-10-12, selected PostgreSQL and explicitly requested provisioning Neon through Vercel. Use the existing Zero Vercel project and its Marketplace integration; no separate Neon account/CLI login is needed.

## Public stages

The first hosted stage is the catalog at `/hub`: previews, contributor credit, exact imports and downloadable Maven artifacts. Vercel serves it through a read-only Node runtime backed by Neon. Auth, reservations and uploads stay closed server-side; missing capabilities also hide authoring controls. No Java runs in Vercel.

Full contributor uploads require the still-outstanding independent checker acceptance, a separately hosted isolated execution environment, GitHub OAuth, quotas, monitoring, backup/removal controls and explicit worker activation. The earlier provider-rejected checker review is not replaced by this hosting review. Do not retry/bypass that assignment or describe closed staging as a fully operational contribution service.

## Database and credentials

The `zerohub` Neon resource is created on Vercel Marketplace's free_v3 plan, region iad1, built-in Neon auth disabled. Vercel owns the resource connection and credential delivery. Existing pinned pg and PostgreSQL transactions/JSONB/BYTEA are retained. Immutable object bytes live in Neon initially; an object-store adapter can be introduced when justified by measured storage/traffic.

Vercel's generated integration connection is an administrator. Connect those integration variables to development only; pull them privately for migration operations. Do not include them in public production/preview deployments. The production catalog receives only `ZERO_HUB_API_DATABASE_URL`, using a distinct minimal login granted hub_api. All credentials stay out of Git and tool/chat output.

Migration owner, API, checker and publisher use separate roles/logins. NOLOGIN group roles, column grants and immutable/status triggers are defined in hub/sql. API cannot create results, releases or stored objects. Checker cannot publish; publisher cannot change verdicts/lease work or authenticate. Runtime startup verifies actual login authority; SET ROLE on an owner connection is not isolation.

## Vercel runtime

- `ZERO_HUB_EMBEDDED=1`: use the read-only server-side runtime; no external API host is needed for the catalog.
- `ZERO_HUB_ORIGIN=https://zero.codepet.ca`: exact public origin.
- `ZERO_HUB_API_DATABASE_URL`: restricted connection, never a fallback to the integration owner URL.
- `ZERO_HUB_URL`: optional existing fixed-destination proxy for local development or a separately reviewed full hosted service; not required by the embedded catalog.

The embedded runtime uses bounded pools, no browser session/cookie forwarding, explicit unavailable checker/publisher functions and no runtime DDL/background workers. Read responses are capped at4MiB. It reuses the existing HTTP catalog/artifact contract; source edits remain ordinary Java and Maven versions stay exact.

Separate Node entrypoints prepare migrations, checking and publication. Workers require their own login, explicit enable flag and no OAuth/other-role environment credentials. The Docker runner still needs a deliberately provisioned Docker-compatible isolated host; a container-based deployment alone is not that host.

## Operations and release

Run website tests/types/build, actual PostgreSQL role/integrity/HTTP tests, local read-only browser proof and existing local enabled-library integration proof before source review. Publish through a reviewed feature PR and verify the actual public catalog, closed authoring endpoints, artifact hashes and Maven consumers. Keep known maintained seed source separate from unreviewed public uploads; never copy demo identity101/zero-local-demo into production attribution.

Neon free-tier restore/compute/storage limits are not a backup policy. Before uploads open, establish independent private exports and test restore, expired-session cleanup, one concurrent checker, per-account/global queue/storage quotas, pagination, queue/error alerts, a kill switch and append-only withdrawal controls. Do not enable unlimited polling and assume an idle database still sleeps.
