# ZeroHub PostgreSQL service

The same service supports local integration and read-only hosted staging. The
HTTP entrypoint never migrates, executes candidates, starts workers or publishes
releases. Provisioning, deployment and public upload activation are separate
operator steps. Uploads remain disabled until the independent checker-security
gate and hosted execution requirements are satisfied.
`pg` is pinned to 8.23.1 with the npm registry integrity in `hub/package-lock.json`.

From the repository root:

```sh
npm ci --prefix hub
npm run test:postgres --prefix hub
```

The test command starts the pinned PostgreSQL 17 image on `127.0.0.1:15439`, uses
a fresh password through a mode-0600 temporary environment file, runs the service
suite against the actual database, and removes the container and temporary files
in `finally`. Data is held in a container tmpfs. Set `ZERO_HUB_TEST_PORT` when that
port is already occupied; the fixture never attaches to an existing database.
Service tests use a trusted checker fixture to isolate database/HTTP behavior;
they do not claim to prove compilation, Java behavior or container isolation.
The checker and end-to-end integration have separate real execution checks.

## Module lifecycle

Import `createHub` from `hub/service/hub.mjs`:

```js
const hub = createHub({pool, storageRoot, checker, origin, localIdentity});
// Hosted callers instead pass storage:createPostgresStorage(pool) and
// uploadsEnabled:false. The API requires a restricted, separate database login.
await hub.migrate();
const server = http.createServer(hub.handler);
hub.startWorkers();
// During shutdown:
await hub.stop();
await pool.end();
```

`pool` is a connected `pg.Pool`; `storageRoot` is an absolute private directory
outside Git; `origin` is the exact website origin, even when the loopback service
uses a separate port. `checker` supplies trusted `validateBundle`, `sourceDigest`,
`expectedPom`, `expectedPolicyDigest` and `checkSubmission` exports from `hub/checker/runner.mjs`.
`migrate()` runs the trusted SQL under a transaction/advisory lock, then prepares
storage. The caller owns the HTTP server and database pool. `stop()` prevents
new worker ticks and waits for the active tick; it does not close the pool.

`workOnce()` atomically claims one queued submission with a lease, executes the
trusted checker, and records an immutable internal result and artifact bytes.
Checker infrastructure failures retry at most three times; failed declared checks
remain failed. Expired worker leases are reclaimed. The configured check policy
must finish within the ten-minute lease. `publishOnce()` independently validates
ownership, source, current policy implementation digest, report, exact source JAR/license, declared binary class
paths, Java 17 class versions, artifact digests and the trusted POM. It stores only
immutable bytes and transactionally inserts the public release. It executes no
candidate source, POM, build script or hook. Passing reports require exactly one
true result for each mandatory gate: bundle, fixed-build, api, behavior, first and
second. Failed runs retain partial reports. The stored policy digest must match
the current checker implementation; old verdicts cannot publish after a policy
update. Earlier local results missing that digest fail closed. `drain({max:100})` and
`startWorkers({intervalMs:1000})` compose these separate stages.

Internal methods `reserveLibrary(user,{className,title})`, `submit(user,bundle)`,
`getSubmission(user,id)` and `catalog()` support trusted integration callers.
These methods accept a server-authenticated identity, never a client owner field.
`scaffoldBundle` is exported from `scaffold.mjs`. The numeric GitHub ID owns the
reservation; display login changes confer no ownership. Short IDs use a Postgres
sequence. A version has one active submission and one immutable release. Identical
uploads return the same job; a corrected failed attempt can reuse an unpublished
version with a new immutable job and preserved old report. Pending and published
source cannot be replaced. Catalog includes all immutable published versions;
`GET /api/hub/libraries/<id>` returns the most recently published release, with an
optional exact `?version=` lookup.

Storage uses SHA256 filenames, exclusive atomic links, no-follow reads and exact
size/digest checks for every response. A filesystem or transaction interruption
before listing can safely retry the same bytes. Missing/drifted bytes fail closed.
Artifact routes support GET/HEAD and derived `.sha256`/`.sha1` checksums for Maven;
SHA256 in the release manifest remains the artifact identity. No mutable Maven
metadata or version ranges are accepted. Both storage adapters verify exact size and SHA256 on every read. PostgreSQL
`hub_objects` bounds each bytea to 16 MiB and inserts exclusively with
`ON CONFLICT DO NOTHING`, then reads and verifies the existing object. The local
filesystem and trusted DB
administrator remain part of the authority boundary; SQL immutability triggers
are defense against ordinary updates, not protection from a superuser.

## Local proofs and HTTP

Local proofs continue to use `storageRoot` and `hub/local.mjs`. The HTTP entrypoint
requires `ZERO_HUB_API_DATABASE_URL` and `ZERO_HUB_ORIGIN`, and uses PostgreSQL
artifact storage. It binds `127.0.0.1:8788` by default (`ZERO_HUB_HOST` and
`ZERO_HUB_PORT` override). `/healthz` checks database connectivity.
Database credentials belong in the environment, never source or printed command
arguments. Root integration can import
`startDisposablePostgres({port:15440})` from `postgres-fixture.mjs`; it returns
`{pool,stop,connectionString}` and the caller must call `stop()` in `finally`.
Do not log that connection string.

Local proof callers may explicitly pass `localIdentity:{id,login}` to
`createHub`; the HTTP-only hosted entrypoint does not create a developer identity.
A local identity is refused for a non-loopback origin, remote socket or
`NODE_ENV=production`. `GET /api/hub/auth/start` signs into that local
identity; merely reading session state never signs in. The UI receives `mode:local`.
Without a developer identity or complete OAuth configuration sign-in fails closed.
Public read routes can still serve already checked releases.

OAuth requires an HTTPS `ZERO_HUB_ORIGIN` and both
`ZERO_HUB_GITHUB_CLIENT_ID`/`ZERO_HUB_GITHUB_CLIENT_SECRET`. No live credentials
were used in tests. OAuth state is bound to a separate browser cookie, expires
in ten minutes and is atomically consumed once before code exchange. Fixed GitHub
endpoints supply the numeric identity; the access token stays transient. Session
cookies (`zero_hub_session`, `zero_hub_oauth`) are HttpOnly/SameSite=Lax and Secure
on HTTPS. Every mutation requires the active session, exact Origin and matching
`X-Zero-CSRF`. Logout destroys that session. Sign-in redirects to
`/hub/prepare`. Production hosting, HTTPS/OAuth provisioning, rate limiting,
separate hosted worker roles and operational hardening remain separate deployment
work; this local process is not a hosted service claim.


## Hosted process separation

API admission uses a fixed shared policy before persisting new reservations or
source. Transactions take one global advisory lock before row locks, so concurrent
API instances cannot independently pass the same account/global allowance.

| Allowance | Limit |
| --- | --- |
| Active submissions, including queued/checking/checked | 2 per account;100 globally |
| New submissions in a rolling24 hours, including failures | 20 per account |
| New library reservations in a rolling24 hours | 10 per account |
| Reserved libraries over the account lifetime | 100 per account |
| Retained source JSONB text, including failed/published history | 16MiB per account;256MiB globally |

Excess requests return a short429 message. Ownership remains bound to GitHub
numeric ID; another login name cannot claim the allowance/library. Exact-source
retries return their existing submission even at a limit, and changed source
cannot overwrite a reserved version. The existing1MiB request bound remains.
Rolling windows use the database clock. Source bytes use PostgreSQL's UTF-8
JSONB text representation, including the preview and descriptor, rather than
compressed on-disk size. These are API limits; direct administrator writes are
outside them. They do not cover authentication rows, result/artifact/object bytes,
database overhead, or replace later storage/retention controls. Published source
is counted permanently; no automatic deletion or pin changes occur.

`npm run test:postgres` now runs the service and admission suites serially against
one disposable database. It does not execute submitted Java or contact a hosted
database. Public uploads remain closed independently of passing these tests.

Expired authentication housekeeping is a separate bounded operator job:

```sh
node hub/service/session-cleanup.mjs
```

It requires `ZERO_HUB_CLEANUP_ENABLED=1` and only the restricted
`ZERO_HUB_API_DATABASE_URL`; OAuth secrets and migration/checker/publisher URLs
are refused. `ZERO_HUB_CLEANUP_BATCH` defaults to500 and must be1–1000. One
transaction removes at most that many expired sessions and that many expired
OAuth states, using a cleanup-only advisory lock without extra SQL grants. Live
authentication, users, library records and immutable release history are retained.
Output contains counts only. This command is not scheduled or run against the
hosted database yet; scheduling and rate limits for creating authentication rows
remain rollout requirements. Disposable real-role verification:

```sh
node --test hub/service/session-cleanup.test.mjs
```

That test uses its own disposable PostgreSQL fixture on localhost15443, never a
configured hosted database. See [the contribution rollout](../../docs/ZEROHUB-HOSTING.md)
for phase exits and the outstanding public checker gate.

`npm start --prefix hub` serves HTTP only. Its `pg` pool is bounded to 5 clients,
with 10 second connection and 15 second statement timeouts. The URL's `sslmode`
and certificate settings are retained; no verification-disabling SSL override is
added. Neon pooled hostnames containing `-pooler` are refused: use a direct
connection URL because the runtime establishes session role/timeout options.
Runtime startup verifies the session login is not elevated and belongs only
to its expected runtime group, including transitive and explicitly settable
memberships. Extra predefined/custom roles, membership administration, owned
objects and directly granted object privileges are refused. Direct CONNECT on
the current database without grant option is the sole object-grant exception;
normal PUBLIC defaults remain separate. Runtime authority belongs to the
NOLOGIN group rather than direct LOGIN grants. A database-owner URL with
`SET ROLE` is not credential separation.

`ZERO_HUB_UPLOADS` defaults to disabled; only an explicit `1` enables authoring.
Disabled catalog/session responses contain `capabilities:{uploads:false}`;
session contains `user:null` and no CSRF token. Auth, logout, reservation and
submission routes return 503 before touching authoring/OAuth state. Public
catalog, exact releases, previews and Maven GET/HEAD remain available. Disabled
HTTP startup does not construct OAuth configuration, even if stale OAuth variables
are present. The default `createHub` capability stays true for existing local
proof callers; hosted callers must explicitly set false.

Initial database setup is a deliberate operator procedure:

1. Use the integration/administrator credential only in a migration environment
   to run `npm run migrate --prefix hub -- --bootstrap-roles`. It reads
   `ZERO_HUB_MIGRATION_DATABASE_URL`, creates four NOLOGIN group roles and
   prepares schema grants. It creates no login or password.
2. Separately create/select a migration login and grant it only
   `hub_migration_owner` membership. Run `npm run migrate --prefix hub` with its
   migration URL. Tables, sequence and trigger functions are owned by that group.
3. Create separate minimal LOGIN principals, granting one of `hub_api`,
   `hub_checker` or `hub_publisher` to each. Never grant an elevated Neon role,
   database ownership or multiple hub roles to runtime principals.
4. Place only the restricted API URL in the HTTP runtime. Keep integration-owner
   and migration credentials outside runtime environments, including automatic
   Marketplace environment variables. A restricted URL alongside an owner URL
   does not isolate the process's credentials.

`hub_api` may authenticate, reserve and queue immutable source; it cannot change
submission status, checker results, releases or objects. `hub_checker` reads
source, owns bounded lease/status transitions and inserts immutable results; it
cannot publish, write objects or read OAuth state. `hub_publisher` reads checked
source/results, finalizes checked submissions, inserts releases and object bytes;
it cannot lease, alter verdicts or access identity/OAuth tables. Status triggers
check role membership, including after RESET ROLE. Runtime role grants contain
no passwords. SQL ownership and immutability are not protection from an owner or
superuser.

`npm run checker --prefix hub` and `npm run publisher --prefix hub` use separate
`ZERO_HUB_CHECKER_DATABASE_URL` / `ZERO_HUB_PUBLISHER_DATABASE_URL` values. They
require explicit `ZERO_HUB_WORKERS_ENABLED=1`, refuse OAuth and other-role
credentials, and expose no public listener. They import a pipeline module that
has no OAuth/session/HTTP code. Publication imports pure validation, never the
Docker runner. Worker ticks process one bounded job at a time. SIGINT/SIGTERM
stop new work, wake the interval and wait for the current bounded operation;
shutdown has a 180second upper grace period. The checker Docker backend is
unchanged and still requires a separately configured isolated execution host.
No worker activation or candidate execution was performed for hosted staging.

Verification: `npm run test:staging --prefix hub`, `npm run test:report --prefix
hub`, and `npm run test:postgres --prefix hub`. The disposable PostgreSQL suite
uses distinct fresh LOGIN credentials and verifies cross-role denials, RESET ROLE,
checker/publisher pipeline operation, immutable concurrent object retries,
corruption rejection and HTTP-only health/public-artifact serving. These service
fixtures do not claim Java execution or checker-security acceptance.
