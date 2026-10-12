# Local PostgreSQL hub service

This is a local integration implementation. It changes no existing catalog or
published release and provisions no hosted database, object store or OAuth app.
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
metadata or version ranges are accepted. The local filesystem and trusted DB
administrator remain part of the authority boundary; SQL immutability triggers
are defense against ordinary updates, not protection from a superuser.

## Running locally

The entry point requires `ZERO_HUB_DATABASE_URL`, `ZERO_HUB_STORAGE` and
`ZERO_HUB_ORIGIN`. It binds `127.0.0.1:8788` by default (`ZERO_HUB_PORT` overrides).
Database credentials belong in the environment, never source or printed command
arguments. Root integration can import
`startDisposablePostgres({port:15440})` from `postgres-fixture.mjs`; it returns
`{pool,stop,connectionString}` and the caller must call `stop()` in `finally`.
Do not log that connection string.

A local test identity requires all three explicit settings:
`ZERO_HUB_LOCAL_IDENTITY=1`, `ZERO_HUB_LOCAL_GITHUB_ID` (a positive numeric ID), and
`ZERO_HUB_LOCAL_GITHUB_LOGIN`. It is refused for a non-loopback origin, remote
socket, or `NODE_ENV=production`. `GET /api/hub/auth/start` signs into that local
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
`/community/prepare`. Production hosting, HTTPS/OAuth provisioning, rate limiting,
separate hosted worker roles and operational hardening remain separate deployment
work; this local process is not a hosted service claim.
