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
 descriptor:<descriptor>,policyRevision:<40hex>}.
Descriptor kind/slug/version match; library folder exactly libraries/<slug>,
game folder '.' initially. Ingestion computes sourceDigest after fetching files.

Release:
{schema:1,kind,id,slug,version,title,description,license,repository:<repository>,
 contributor:{githubId,login},source:{commit:<40hex>,folder,sha256:<64hex>},
 policyRevision:<40hex>,status:'available'|'withdrawn',
 artifacts:{jar?,sources?,pom?,zip?,preview?},namespace?,coordinate?,libraryKind?,
 components?,controls?}.
Artifact {path,url,size:<positive integer>,sha256:<64hex>}.
Library requires jar/sources/pom, namespace/coordinate including version.
Game requires zip/controls. Optional generated components array entries
{className:<qualified Java name>,description,usage,api:string[]} belong to namespace.
URL exact configured origin+'/'+artifactPath, HTTPS or explicit loopback-test origin;
no query/fragment/credentials/redirects. Unknown schema fields rejected.

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
