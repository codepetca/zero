# Managed library implementation contract — 2026-10-17

Owner explicitly reopened the prior checker acceptance hold and requested real
sample publication/consumption on2026-10-17. Acceptance is still required; source
review alone does not enable public execution. Coordinator owns integration,
platform/CLI/workflow/config rollout and live native/public acceptance.

## Checker writer

Own hub/checker/**, sharing/library-checker.mjs and its focused tests.
Keep isolation and trusted completion/JAR-origin machinery; version current policy
as zero-libraries-v1 with identity-derived namespace, widget/helper distinction,
ordinary library source/check/example layout. No submitted POM/script execution.
Legacy local widget fixtures may remain readable if inexpensive; no legacy catalog
or published ui artifacts are being migrated. Do not weaken isolation for JavaFX.

Shared export:
`checkLibrarySource({request, files, sourceDigest}, options={})` async returns
`{passed, policy, policyDigest, sourceDigest, checks, platforms, components,
 artifacts?:{jar:Buffer,sources:Buffer,pom:Buffer,preview?:Buffer}, image:{id,platform}}`.
`request` is a validated frozen request without sourceDigest; files are exact
folder-relative `{path,bytes:Buffer}` from the trusted GitHub reader; sourceDigest
is that reader's original digest (never a repackaged source digest). The adapter
must validate the descriptor matches the committed descriptor and derive library
identity from request.repository.id + slug. POM has fixed exact coordinate,
license/properties and only allowed JavaFX dependencies, no build/hooks/repositories.
Components are generated from actual declared public classes and API, with no
candidate receipt authority. Helpers need no Node view; widgets retain that API.
Each behavior/first/second group has at least one finite main, separately compiled
against only the built JAR/allowed JavaFX. All sources/resources namespace-bound.
Return failed checks as passed:false; infrastructure failures throw. Source/image
policy digest binds every trusted build/parse/harness/runner input. options only
trusted local image/scratch/deadline settings, not contributor configuration.

## Browser writer

Own extension/src/web-export/**, affected web-run diagnostics and focused web tests.
May change authoring export visibility or consumer byte-return APIs after recording
the change; do not alter sharing contracts, publisher/checker or released metadata.
Use authoring.discoverLibraries for declared mode/generated-POM authority. Include
local source/resources/descriptors/state in snapshot+commit provenance. Published
mode only exact available accepted release, verified jar/sources/pom hashes and
bounded source-JAR extraction; no local or Maven-cache fallback. Fixed generated
WebFX compiler POM gets only verified source, existing API/dependency/wrapper policy
remains active. Check class/namespace/resource/case collisions and source shadows.
Manifest binds exact accepted library identity/version/artifact hashes; validation
must recheck evidence or fail closed. Preserve diagnostic paths and native behavior.

## Managed workflow / publisher coordinator

Separate trusted intake, candidate-checking and publication jobs. Worker has only
public source/registry read, no publisher environment/Blob/write credentials,
no candidate on trusted image build path, no shared privileged caches. Candidate
containers offline/non-root/read-only/bounded and receive no host data/secrets.
Trusted fixed worker writes bounded check metadata plus exact output artifacts.
Publisher independently verifies official workflow/run/attempt/head/ref/event/job
conclusion and artifact identity, frozen request fingerprint/source digest/commit/
policy, checker policy/image provenance and all artifact lengths/hashes. Recheck
owner/open issue before immutable acceptance. No arbitrary local receipt file
accepted as managed evidence. Failed/cancelled/expired work never accepts a version.
Use existing ledger, staged delivery, immutable CAS/reservations and recovery.
Preserve game workflow compatibility and existing accepted bytes. Both explicit
library configuration and real reviewed managed evidence are required to publish.

## Phase exits

1. Current-format helper/widget local isolated success and negative/isolation
   checks on actual Linux, plus pinned trusted image; old reference is not proof.
2. Browser local and exact-published source tests and actual Sky Hop play.
3. Two independent risk-matched changed-source reviews; local and real GitHub CI.
4. Deliberate reviewed policy/client promotion preserving immutable old kits.
5. Actual native Share/Check and public sample accepted artifacts/catalog; second
   project Browse/Add/Apply/Run/browser, exact Update/Revert, clean-cache public
   Maven byte/origin proof. Mac/managed Linux/Windows coverage stated separately.
