# Hub MVP contract — local integration first

Coordinator owns this contract. Implementation owners: service (`hub/service/`,
`hub/package*`, `hub/sql/`); checker (`hub/checker/`); website (`website/` hub additions).
Existing health-bar catalog/endpoints/Workshop and published bytes stay unchanged.
No deployment, live credentials, pushes or public releases are authorized.

## Transport and data

Node ESM. PostgreSQL stores identities, reservations, immutable submissions/results
and release manifests. Local fake publication stores immutable bytes outside Git.
Stable GitHub numeric user ID owns a library; login is display text, not authority.
IDs are server-assigned `ui` plus a monotonically issued positive base36 number.
Java namespace `zero.<id>`; Maven `ca.codepet.zero.library:<id>:<exact semver>`.

A submission is JSON `{descriptor, files}`. File keys use POSIX relative paths;
values are UTF-8 source/document text except `preview.png`, which is base64 PNG.
No archives, symlinks, submitted POMs, build scripts or publisher hooks.
Maximum request 1 MiB, 64 files, 64 KiB per text file, PNG 256 KiB, Java 17,
JavaFX 21.0.12; only JavaFX controls/swing dependencies; no library dependencies
in this first policy. Names/metadata are plain text. Exact allowed paths:
`src/zero/<id>/<Class>.java`, `checks/BehaviorCheck.java`,
`examples/first/Main.java`, `examples/second/Main.java`,
`API.md`, `CHANGELOG.md`, `LICENSE`, `preview.png`.
At least one source and all other paths required. Descriptor:
`{schema:1, libraryId, version, title, description, category:'ui'|'game'|'tools',
 components:[{className,description,api:[string],usage:string}]}`.
Each component is an exact top-level declared source class; readable public APIs
remain ordinary Java. All components expose `public Node view()`; constructors
and setters are unrestricted ordinary Java. No base class/registration required.
Hub-generated starter scaffolds one class with `view()` and `setValue(String)`.
User-authored `BehaviorCheck` and two finite JavaFX applications must actually use
classes from the built JAR. They are useful declared checks, not verdict authority.
The hub-owned worker independently checks classes, public view signature, JAR
origins, license/metadata, source boundaries and two consumer execution. Checked
scope is disclosed; arbitrary behavior correctness cannot be proven automatically.

## Checker interface

`hub/checker/runner.mjs` exports `checkSubmission(bundle, options={})`.
Throws on host/config/infrastructure failure; never fabricates a passing result.
Returns `{passed:boolean, policy:'zero-widgets-v1', sourceDigest:string,
 checks:[{id:string,passed:boolean,detail:string}], platforms:['linux-<arch>'],
 artifacts?:{jar:Buffer,sources:Buffer,pom:Buffer}}`.
Also exports canonical `sourceDigest(bundle)` and `validateBundle(bundle)`.
Validation rejects unknown fields/paths, controls, invalid names, foreign namespace,
undeclared sources, version ranges and missing evidence. Canonical source digest
is SHA256 over recursively key-sorted JSON including descriptor and every file.
Worker executes only trusted fixed compiler/harness policy; submitted tests run
in separately bounded unprivileged offline containers with no host data/secrets,
Docker socket or publish credentials. Host runner receives artifacts and builds
verdict from process status, never from submitted receipts/flags/log markers.
Image pinned by content digest/build ID. Bound time, output, pids, memory, CPU,
filesystem; clean containers/temp dirs on every exit. No execution in publisher.

## Service and website HTTP (same origin via website proxy)

`GET /api/hub/catalog` -> `{mode:'local'|'production', libraries:[release]}`.
`GET /api/hub/session` -> `{user:null|{id,login},csrfToken?,mode}`.
`GET /api/hub/auth/start`, `GET /api/hub/auth/callback` GitHub OAuth, state-bound.
`POST /api/hub/logout` destroys session.
`POST /api/hub/libraries` body `{className,title}` -> `{libraryId,namespace,
 coordinate, bundle}` with editable, runnable starter files.
`POST /api/hub/submissions` body bundle -> `{id,status}`; owner-only.
`GET /api/hub/submissions/<id>` -> `{id,status,report?,release?}`; owner-only.
`GET /api/hub/libraries/<id>` public latest release.
`GET /api/hub/maven/<standard coordinate path>` immutable verified bytes.
Every mutation requires session, exact Origin and X-Zero-CSRF token. No client
owner/result/status/publishing parameters. No public checker/publisher endpoint.
Release shape `{libraryId,version,title,description,category,components,namespace,
 coordinate:{groupId,artifactId,version},sourceDigest,checks,platforms,
 artifacts:{jar:{sha256,size,path},sources:{sha256,size,path},pom:{sha256,size,path}},
 preview:{sha256,size,path},api, changelog, status:'automatically-checked'}`.
Repository URL is same-origin `/api/hub/maven`; UI shows exact POM and Java import.
Legacy website routes remain live. Hub pages clearly mark local test mode.

Service `createHub({pool,storageRoot,checker,origin,localIdentity?,oauth?})` returns
HTTP handler/lifecycle API; exact exports may be coordinated by messages. Worker
claims queued jobs, checks immutable source, records internal result; separate
publisher validates ownership/policy/digests/artifacts, stores exact bytes then
transactionally lists release. No supplied JSON result is authoritative. Unique
(libraryId,version), locking, retries and artifact integrity prevent replacements.
Local developer identity only explicit loopback-only mode, never production default.
Missing configuration fails closed; current public site may display hub unavailable.

## Acceptance

Actual PostgreSQL tests: ownership/session/CSRF, reservations, validation, forged or
stale verdicts, byte/source drift, concurrent versions/retries; old endpoints pass.
Actual Docker proof: Starter UI adapted to reserved namespace, successful JAR checks
and both consumers; compile/test failure, timeout, network/host/credential isolation.
Website: discovery by component, containing library, preview/API, prepare/upload/
status, exact dependency/import. Java app resolves the published local JAR using
standard Maven. Independent two-view source review before acceptance. Local first;
public hosting/OAuth provisioning/object storage and hardened hosted workers require
separate owner-authorized deployment. Containers reduce risk, not a proof against
all kernel vulnerabilities or malicious package behavior after download.
