# GitHub sharing implementation contract

Schema 1. Coordinator owns this contract and extension/src/sharing/contracts.js.
Worktree: /Users/stew/.codex/worktrees/github-sharing-adoption/zero.

## Authority

Implement docs/GITHUB-SHARING-PLAN.md: existing game repository, optional libraries,
separate game/library sharing, no Neon/legacy adapters. User requested full
implementation and waived routine usage/review-budget stops. Actual prior generic
checker-review rejection remains binding: no retry/bypass/public candidate execution.
DeepSeek paused. Coordinator owns Git/external actions/acceptance. Workers do not delegate.

## Shared pure CommonJS module

Module has no filesystem/process/network imports; ships inside VSIX.
Backend ESM imports its default CommonJS export.

Exports:
- SCHEMA=1, JAVA_RELEASE='17', JAVAFX_VERSION='21.0.12', LIMITS.
- validateSlug: lowercase ASCII letter start; letters/digits with single hyphens
  between segments; 1–48 chars. Returns input.
- validateVersion: exact x.y.z nonnegative integer semver, no leading zeros except
  zero, no ranges/SNAPSHOT/prerelease. Returns input.
- validateFolder: '.' or safe relative POSIX path, no traversal, absolute, hidden,
  backslash/control segments. Returns input.
- validateRepository: {id,ownerId,owner,name,url}; IDs positive decimal strings;
  URL exactly https://github.com/<owner>/<name>, safe ASCII names, no .git/query/
  fragment/credentials. Returns clone.
- identity(kind,repositoryId,slug): library returns {kind,id:'lib-r<ID>-<slug>',
  slug,repositoryId,namespace:'zero.contrib.r<ID>.<slug hyphens to underscores>',
  coordinate:{groupId:'ca.codepet.zero.contrib.r<ID>',artifactId:slug}};
  game returns {kind,id:'game-r<ID>-<slug>',slug,repositoryId}.
- validateDescriptor(value): validates/clones authored shape below.
- validateRequest(value): validates/clones request, requester equals ownerId;
  ingestion must independently resolve GitHub metadata.
- validateRelease(value,{artifactOrigin}={}): validates/clones release and URLs.
- validateCatalog(value,options): {schema:1,revision:<40hex>,releases:[release]},
  duplicate kind/id/version forbidden; bounded count/bytes.
- artifactPath(identity,version,kind): library jar/sources/pom or game zip;
  Maven standard layout; games/<id>/<version>/project.zip; preview for either
  at previews/<id>/<version>/preview.png. sha256/sha1 sidecars constructed by
  storage/publisher as suffixes to actual artifact paths.
- publicationUrl(request,{repository='codepetca/zero'}={}): GitHub new issue link
  containing title/bounded JSON request body; does not send a message.

Descriptor:
{schema:1,kind:'library'|'game',slug,version,title,description,license,preview?}.
Library adds libraryKind:'widget'|'helper'; game adds controls:string.
Preview safe relative path, default preview.png. Reject unknown fields. No generated
API/owner/namespace/coordinates/commands/URLs. Packaging checks media/license separately.

Frozen request:
{schema:1,kind,slug,version,repository:{id,ownerId,owner,name,url},
 requester:{githubId,login},commit:<40hex>,folder:'.'|safe relative path,
 descriptor:<descriptor>,policyRevision:<40hex>,web?}.
Descriptor kind/slug/version match; library folder exactly libraries/<slug>,
game folder '.' initially. Ingestion computes sourceDigest after fetching files.

Release:
{schema:1,kind,id,slug,version,title,description,license,repository:<repository>,
 contributor:{githubId,login},source:{commit:<40hex>,folder,sha256:<64hex>},
 policyRevision:<40hex>,status:'available'|'withdrawn',
 artifacts:{jar?,sources?,pom?,zip?,preview?},namespace?,coordinate?,libraryKind?,
 components?,controls?,web?}.
Optional web (request and release only):
{provider:'github-pages',url:<canonical public HTTPS page>,commit:<40hex>,
 runId:<positive safe integer>}.
Only root games may carry web; commit equals request.commit/release.source.commit.
The enclosing numeric repository ID and verified owner bind the receipt. Authored
descriptors remain unchanged; URLs/run receipts are not written into zero-game.json.
Ingestion never trusts pasted receipts or editor workspace state: the trusted reader
independently resolves public numeric repository ownership, actual public workflow
Pages URL (including its verified custom domain), exact successful workflow-dispatch
run on main at .github/workflows/zero-web.yml, source SHA/repository/owner IDs, and
bounded unauthenticated public zero-source-sha.txt containing SHA and run ID.
HTTPS readiness pins checked public DNS addresses, rejects redirects and limits the
marker to 100 bytes. No credentials reach a student-hosted page. Network failures
remain infrastructure retries; a mismatched hosted version requires republishing.
Trusted evidence, immutable request fingerprint/deduplication and release acceptance
all include web. Old records without web remain valid.

Web provenance describes the hosted version observed at acceptance. Its Pages URL
is mutable: later Publish app updates keep the same Play latest link without another
Hub request. Play latest opens an external student-hosted live app; it does not claim
to run the immutable catalog source snapshot. Source links/ZIPs remain exact source
snapshots. Withdrawn/source-only releases offer no Play action. No iframe, proxy,
compiled-game artifact, new hosting service or mutable registry pointer is added.

Artifact {path,url,size:<positive integer>,sha256:<64hex>}.
Library requires jar/sources/pom, namespace/coordinate including version.
Game requires zip/controls. Optional generated components array entries
{className:<qualified Java name>,description,usage,api:string[]} belong to namespace.
URL exact configured origin+'/'+artifactPath, HTTPS or explicit loopback-test origin;
no query/fragment/credentials/redirects. Unknown schema fields rejected.

## Catalog rollout

Schema-1 enrichment is not compatible with old strict validators. The original
GET /api/sharing/catalog validates the canonical snapshot and projects out web,
preserving the original release allowlist. GET /api/sharing/catalog/web returns
the enriched validated catalog for the website and new kits. Registry snapshots
remain canonical/immutable; both APIs use the same bounded verified reader and
canonical contracts. Public request-status summaries expose no web receipt or
operational state and still validate request/release web bindings. Existing kits
keep their original configuration/bytes. Activation and a new kit's catalog URL
are deliberate release decisions, not local-test effects.

## Ownership

Coordinator: contracts.js/tests, CONTRACT, docs/CURRENT/EVIDENCE, package integration,
workflows/activation/rollout and acceptance.
Authoring: extension/src/sharing/authoring.js, local-check.js, focused tests,
sharing/harness/Java helper. No extension.js edits yet.
Registry: sharing/registry.mjs, requests.mjs, publication.mjs, game-package.mjs,
file-storage.mjs and tests. No workflows/network writes/execution/credentials yet.

## Limits and state

LIMITS: metadataBytes65536, librarySourceBytes1048576, artifactBytes16777216,
gameSourceBytes52428800, gameArchiveBytes104857600, libraryFiles64, gameFiles512,
catalogBytes4194304, catalogReleases5000. Technical limits, no lifetime quotas.
No .git/private/generated/symlink inputs. Fixtures establish no live authority.

Requests immutable fingerprints; attempts/release ledger durable. Failed source
can be corrected before acceptance. Stage/hash, CAS-accept version as delivery-pending,
finalize standard paths, delivery-ready, catalog. Accepted versions never change
source. Reconciliation uses requests, not Actions queues. No binary report copies.

## Unreleased core-dependent library contract (local preparation only)

Schema-1 descriptors/releases retain their existing fields and reject core fields.
Schema-2 is library-only. A descriptor requires
`coreRequirement: {minVersion:"0.3.0",maxExclusive:"0.4.0"}` and
`coreInput: {version:"0.3.0",sourceSha256:<64hex>}`. Versions are exact; the range
stays inside one 0.x minor line and its exclusive upper bound is the next minor
at patch zero. The selected input version must satisfy that range. Authored input
identifies source; it does not establish a successful build.

A schema-2 release instead requires the copied `coreRequirement` and checker-owned
`coreBuild: {version,sourceSha256,jarSha256,buildRecipeSha256,javaRelease:"17",
javafxVersion:"21.0.12"}`. Its version must satisfy the same range. These hashes
are provenance produced from actual reviewed builds; validating their shape does
not authenticate them. Request/catalog envelopes remain schema1 and validate
nested schema2 libraries. Games remain schema1. Current hosted preparation
explicitly rejects schema2 libraries; this local schema change activates no
hosted checker or publication path.

Current unreleased core is `school.zero:zero-core:0.3.0`. Generated projects carry
tracked root `zero-core.json` schema1 with its coordinate, Java/JavaFX pins, sorted
`{path:"src/main/java/zero/...",sha256}` entries and `sourceSha256` (SHA256 of
compact JSON for that sorted array). Hash UTF-8 source after CRLF→LF only; reject
invalid UTF-8, BOM and lone CR. Validation recomputes all16 reviewed source hashes
from included bytes. The record alone is never authority. Assemblers write it
from exactly their included sources; editor updates do not migrate old projects.
Legacy libraries without a core requirement need no core record. Contributions
must not bundle canonical core classes. No public release is implied by0.3.0.
