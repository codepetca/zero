# ZeroHub sharing plan

## Status and scope

Owner direction, 2026-11-02: share library source from the student's existing
project repository, retain ZeroHub-hosted Blob storage for accepted library
releases, and plan a verified copy of each added release in the consuming
project. A separate `zero-libraries` repository per contributor is not planned.
Monitor storage and compute, consider deprecating old versions, and decide later
how to mitigate egregious usage. Project-owned library copies are **proposed**,
not an implemented or deployed feature. The
[GitHub sharing adoption plan](GITHUB-SHARING-PLAN.md) and
[contract](../sharing/CONTRACT.md) still describe the current
implementation. Game sharing and the existing checker/publication holds are not
changed. This document grants no authority to push, publish, change credentials,
settings or cloud resources, or delete stored artifacts.

At the inspected `origin/main` f76d931e, a request binds a student repository,
folder and commit; trusted checking and the separate publisher accept immutable
versions. ZeroHub's registry and public Blob serve the accepted JAR, source JAR
and POM. Consumers pin exact Maven versions and web export separately obtains
verified source/resources. Normal Add does not guarantee project-owned copies.
The owner-approved [curation policy](ZEROHUB-POLICY.md) allows withdrawal and
removal and has no automatic expiry. Existing status and deployment gates must be
rechecked before implementation; configuration or local proof alone is not live
acceptance. Nothing below promises existing projects survive a withdrawal.

## Student journey

- **Setup:** The student uses their existing project repository and grants the
  GitHub App the access required for that project. No separate library repository
  is created. Local use and sign-in-later remain possible. Verify personal ownership,
  selected-repository access and required permissions; preserve existing
  repositories and do not request all-repository access as a shortcut. Show and
  review each repository creation, connection and publication action. The current
  selected-repository installer requires an existing repository; the empty-account
  bootstrap remains unproven and needs a guided fallback, not a seamless promise.
- **Share:** A student extracts a library into `libraries/<slug>/` in their
  existing project repository, selects Share, and reviews the exact committed
  source, destination, version, license and effects. The contributor edits that
  source in their project; no copy to a separate library repository is required.
- **Check and publish:** Trusted checking binds source, exact version, build
  recipe and output hashes. ZeroHub's separate publisher stores accepted
  immutable artifacts in its Blob store and records source, hashes, license and
  check results. A request, locally built bundle, or contributor-controlled CI
  result is not trusted acceptance. The proposed source-repository flow must
  preserve this trusted handoff and its existing acceptance gates.
- **Add:** Browse shows one recommended stable version, compatibility, size,
  license and example. Add fetches that exact bundle, verifies it against trusted
  accepted metadata and stages a project-owned copy before changing the pin.
  Include binary JAR, POM, source JAR, required resources and license/notices,
  plus coordinates, sizes, hashes and provenance in a readable manifest. Verify
  actual bytes consumed by native and web builds. Reject missing, unsafe,
  oversized, mismatched or unsupported inputs without changing the project.
- **Update and revert:** Show changes and get explicit confirmation; no opening
  a project silently upgrades it. Keep current and immediately preceding bundles
  for one-step revert; older committed versions remain in Git history and may
  also be downloaded from ZeroHub while retained. Stage and validate all changes,
  preserve unrelated edits, and recover a valid prior state after interruption.
  Ask the student to run and check behavior after updating.
- **Improve:** Another contributor proposes a pull request to the source project
  repository; its owner controls acceptance. A separately named, attributed
  alternative is allowed when its license permits. Additional maintainers or
  core promotion are later choices, not automatic transfers of ownership.

## Versions and availability

Use exact immutable release identities, never floating versions or replacement
bytes. Recommend a single stable version in normal browsing; retain an optional
older-version view with honest availability. Guide creators toward compatible
patch/minor versions and major versions for breaking changes; default a first
stable release to 1.0.0 only after the required checks pass. Automated API and
native/browser checks catch some incompatibilities, not all behavioral changes.
Require a concise change description and do not silently substitute versions.
An owner can deprecate a version with a replacement recommendation, without
rewriting existing pins. Deprecation is an advisory state, not automatic
withdrawal or deletion, and does not free storage. Consider it for old versions;
monitor usage and defer any deadline or policy change. The compatibility checks and supported 0.x behavior
need a concrete contract before rollout; existing accepted versions keep their
identities and cannot be renumbered.

Before sharing, recheck repository identity, current account and app access.
If the source project repository was deleted, guide the student through the
ordinary project repository connection flow before a new share. If access alone
was lost, guide reconnection. Never create a separate library repository.
An existing name may belong to another repository: do not adopt it by name or
silently reuse the former numeric identity. Deleting the source repository does
not itself delete ZeroHub's accepted Blob artifacts, though source links become
unavailable and current policy does not guarantee permanent hosting. A replacement does not restore old releases;
recovery requires verified original files, hashes, attribution and an explicit
operator decision preserving immutable identities. New shares use the new
identity unless a separately reviewed recovery contract establishes otherwise.
Already saved consumer copies remain usable subject to their build dependencies.

## Scope, trust and tradeoffs

A project-owned release protects the selected library files, not the JDK, Maven
wrapper/distribution, plugins, JavaFX, WebFX toolchain, GitHub or Pages. Full
offline backup is separate. The existing narrow dependency contract rejects
arbitrary library-to-library transitive dependencies; retain it initially. A
future expansion must lock the resolved native and browser graphs, artifacts,
licenses, hashes and supported platform variants. Validate redistribution
rights for every bundled file. Browser export must use the same saved release
source/resources and prove WebFX behavior; native success alone is insufficient.

Bound per-file and total bundle sizes after measuring representative libraries;
show size before Add. Binary versions grow consumer Git history even after a
working-tree deletion. Do not silently introduce Git LFS or rewrite history.
Reject unsafe archive paths, symlinks and undeclared executables. Consumer
downloads must use the configured Blob origin and reject redirects, as in the
current contract; a different policy would require separate review. Bind numeric repository identity,
release identity, source commit, checker evidence and exact artifact bytes;
validate at publication and again at consumption. Hashes detect changed bytes,
not whether a library is safe or the checker trustworthy. Candidate code receives
no publisher, GitHub write or app credentials. Never treat student-controlled
metadata, workflows or release assets as authority to execute commands.

<a id="curation-and-capacity-follow-up"></a>
## Phases and acceptance

1. **Contract and disposable proof.** Specify bundle layout, license handling,
   limits, repository identity and explicit setup/consent; investigate actual
   app permissions and the trusted checker-to-Blob publication handshake. Prove a
   small release can be bound to trusted checker output and published without
   giving candidate code credentials. Exit: test unavailable repository, wrong
   owner/account, revoked app access, modified asset, partial upload, retries,
   and no unsupported permission escalation. No live publication is implied.
   Focused actual-code tests exercise `FileRegistry.update` and
   `PublicationService` with an injected atomic adapter and local storage,
   including competing writes, a lost CAS response and late staging. Consumer
   tests reject same-length mutations before a project edit. These do not prove
   the GitHub Contents adapter or the proposed consumer. The local
   [project-owned bundle proof](../prototypes/project-owned-bundle/README.md)
   compiled and exercised the same cloned app through Maven/JVM and WebFX/Chrome;
   it used an experimental bridge, warm tooling caches and fixture metadata.
   Neither proof completes this phase or establishes trusted provenance, real
   service behavior, permissions, sandboxing or recovery.
2. **Project ownership.** Implement Add/update/revert as a reviewed atomic or
   recoverable transaction across bundle, manifest and POM. Both Maven native and
   WebFX export consume the verified saved bytes. Exit: clean clone in a different
   path, an empty cache for the selected library coordinate, ZeroHub and creator
   repository unreachable; native and
   real browser build and behavior work at a nested Pages-style path. Test bad
   hashes, missing sources/resources, collisions, license, interruption and
   rollback. Other upstream dependencies remain explicitly documented.
   Extend the guarded Share game/Open project archive contract to retain and
   validate the required project-owned bundles and manifests without admitting
   arbitrary JARs or executable content. Exit also requires a shared-game ZIP
   round trip: extract into a clean project and build natively and for the web
   with ZeroHub and the source repository unavailable, rejecting tampered or missing bundles.
3. **Guided contributor flow.** Use the existing project repository for extracted
   library source, with sign-in-later and access repair. Share a checked release
   through explicit reviewed actions; preserve namespace, imports, resources and
   compatible core inputs. Exit: clone a source project containing two libraries,
   edit and check native and WebFX examples, and share a new exact version; other
   consuming projects update only by explicit action. Require mock/fixture checks
   plus an independently authorized real account/App flow, including deleted or
   inaccessible source repositories,
   account drift, cancellation, failed upload and retry. Student source and
   unrelated repository files remain intact. Public activation remains gated.
4. **Migration and retention.** Existing hosted releases keep working. Offer an
   opt-in Save in project for each exact old pin, verify against accepted records,
   and fail clearly when bytes are unavailable or edited configurations are
   ambiguous. Inventory accepted records, creator repository availability and
   dependents before any removal. Back up registry history and referenced objects,
   verify hashes and rehearse isolated restoration. Monitor object count, bytes,
   growth, read failures, quota headroom and backup health; choose thresholds
   from measured usage. Include check runs, queue age, retries, runner time,
   storage growth, transfer, operations and cost. Investigate egregious usage and
   decide proportionate temporary throttles, queue controls or curation later;
   no new lifetime contributor quota, automatic expiry or deletion is adopted.
   The reported 13.88 MB across 53 Blob files on
   2026-11-02 is a dated snapshot, not current capacity or a growth forecast.
   Exit: clone old and migrated projects and test each with Blob unavailable.
   Old remote pins may fail; a migrated project must use its verified saved files.
   Also test source-repository loss, without silent substitution or deletion.
   Actual physical deletion or changes to published retention need separate
   authorization and an explicit policy; historical projects may still break.
   Current library namespace and Maven coordinate derive from the source project
   repository's numeric ID. Preserve old clients, links and pins; a replacement
   project repository has a different identity. Never transfer a release or
   rewrite an installed dependency by name alone.
5. **Practice and curation.** Practice has separate discovery and currently
   explicit withdrawal, not automatic expiry or deletion. Decide and disclose a
   practice lifetime, notice and recovery only after project copies work; never
   apply practice expiry to real releases. Withdrawal hides/denies normal use;
   it is not physical reclamation. Keep an audit trail and immutable reservations.
   Published real versions follow the existing policy until revised deliberately.

## Verification plan and release gates

Status key: **evidence** means a bounded existing check, not acceptance of the
proposed feature; **required** means work still to implement and run. Test one
representative library from a student's Share through another student's Add,
native use, browser play, update, revert and fresh clone. Keep fixture identities,
source commit, accepted manifest and output hashes in test receipts. Do not run a
real write, publish, deploy, change permissions, or delete retained data without
the applicable explicit authorization.

1. **Freeze the contract and trust boundary.** Required: define exact accepted
   request, numeric owner/repository identities, immutable artifact paths, version, source,
   checker policy/image/run/attempt and artifact hashes; bundle file set,
   license/notice and size limits; version and core compatibility. Check unknown
   fields, malformed coordinates, duplicate IDs, mismatched or missing evidence,
   changed request/source/checker output, forged contributor metadata and expired
   evidence all fail closed. Mutate each binding independently, replay evidence
   from another run and verify no staging, reservation or credential exposure.
   Check trusted worker isolation, fixed build recipe,
   credential absence and separate publisher provenance with the real checker
   harness. Preserve existing managed checker hold. Evidence: fixed fixture and
   existing checker tests; neither alone establishes the proposed source-repo handoff.
2. **Setup and contribution.** Required: first install with existing and empty
   accounts, sign-in-later, create/connect, existing-name collision, owner and
   numeric-ID checks, selected App access, denied/revoked permissions, account
   switch, cancellation and uncertain creation. Recheck before every write;
   no all-repositories escalation or silent adoption. Clone the contributor's
   existing project repository, find two extracted libraries, modify and check
   examples, and share a new immutable version. Verify source of truth,
   preserved game edits and attribution. Mock tests come first; a separately
   authorized real account/App walkthrough and platform UI are distinct gates.
3. **Upload, acceptance and recovery.** Required: distinct persisted attempt
   identities, trusted evidence and readback; simulate loss before and after
   create, upload, publication and registry CAS, process restart, disk failure,
   missing or partial artifacts, duplicates, pagination bounds, stale
   sessions, ownership drift, delayed completion and competing differing bytes.
   For consumer Blob downloads reject redirects and omit credentials; separately
   validate the managed checker’s required GitHub artifact redirect without forwarding
   credentials. Reverify accepted hashes on each subsequent fetch; a prior readback is
   only point-in-time evidence and hashes do not ensure future availability.
   Assert one immutable version wins, all retries recover the exact accepted
   record, no silent replacement and no deletion of uncertain objects. Prove
   a usable resolution policy without assuming an empty list means an in-flight
   write has ended. Test actual registry adapter conflict/re-read and authorized
   real GitHub API behaviors separately. Evidence: local registry tests use an
   injected adapter; production conflict and uncertain-write recovery remain open.
4. **Transactional Add/update/revert.** Required: verify trusted accepted
   metadata and every bundle member, including same-length tampering, missing
   source/license, unsafe paths, links, duplicate archive entries, decompression
   and size bounds, unsupported dependencies and namespace collisions. Check
   pinned version, saved files, POM and manifest as one recoverable transaction:
   cancellation, power/process interruption at each boundary, disk-full, locked
   files, concurrent edits or account/catalog drift must leave a valid prior or
   committed state with clear recovery. Revert restores exact preceding bytes;
   no implicit upgrade or overwrite of student source. Exercise actual VS Code
   review/apply/undo/error UI, not just planning. Evidence: current configured-origin
   consumer hash tests and a local fixed-fixture
   [six-file Add experiment](../prototypes/add-transaction/README.md) exercises
   staged writes and process-interruption recovery under cooperative POSIX
   locking. It uses a fictional trusted record and test-format POM, cannot
   recover every orphan automatically, and does not implement VS Code save/undo
   or the product transaction; the full gate remains open.
5. **Native, web and project portability.** Required: from a fresh clone at a
   different path with the selected library absent from Maven caches, block both
   ZeroHub and creator library hosts and use the project-owned exact files.
   Verify native JavaFX behavior and WebFX compilation plus actual browser
   behavior and resources at a nested Pages-style path. Trace and compare the
   consumed JAR/source/resource hashes. Repeat after update and revert. Test a
   bounded real resource fixture, missing/tampered files and a supported core
   version; reject unsupported transitives. State whether third-party tool and
   plugin caches are warm or cold; do not call the whole build offline unless
   every external dependency is blocked or retained. Round-trip Share game/Open
   project ZIP without admitting arbitrary executables or losing bundle/license;
   then repeat clone/build. Check Mac, Windows and Linux native paths and Chrome,
   Firefox and Safari browser behavior where supported; report untested cases.
   Evidence: one local clone proof with offline Maven/JVM and WebFX/Chrome using
   a scratch bridge and warm tooling caches; no GUI native test or resources.
6. **Versions, migration and promotion.** Required: check first stable release,
   compatible patch/minor and declared breaking major, duplicate version and
   source identity, old 0.x behavior, unavailable/deprecated/withdrawn version,
   alternate contributor attribution and stable recommendation. Exercise old
   Blob-backed project pins, catalog/client schemas, old immutable kits and
   identity mapping; opt-in exact-byte migration must preserve old state when
   artifacts are unavailable. Verify core proposal licensing, credit, namespace
   collisions, optional migration, maintained docs/examples and API coverage;
   no automatic migration or promotion based solely on popularity.
7. **Operations and release.** Required: measure representative bundle sizes and
   repository history growth, GitHub file constraints and selected limits;
   exercise error messages and capacity pause. Inventory registry and accepted
   objects, back up both, verify hashes and restore in an isolated destination.
   Test monitoring/alerts for storage, failures and backup freshness. Practice
   expiry is a separate explicit policy; test discovery/withdrawal/physical
   retention separately from real releases. Verify compatibility-preserving
   rollback, exact version reservations and delayed client behavior before any
   authorized rollout or removal. A dated storage snapshot is not a forecast.

### Execution and evidence

For each implementation slice: run targeted unit/fault-injection tests first,
then relevant integration checks and independent risk-matched review. Reuse
unchanged evidence only when the relevant source and assumptions match; fix
findings and review the changed delta. Record revision, OS, cache and network
conditions, exact checks, result and untested paths in `VERIFICATION.md`.
Existing useful commands include `npm run test:sharing`, `npm run test:web`,
`npm run verify:web`, the individual `extension/test/sharing-*.test.js` tests,
and the commands in the linked prototype READMEs. Choose affected checks rather
than treating a command list as proof. Native window/browser and real-account
checks require their actual environment; mocks cannot stand in for them.

Ready for the next local slice: design the real VS Code editor/save/undo and
project-owned bundle transaction contract, then exercise it against the existing
POM editor and native/WebFX consumers without losing dirty student changes.
The fixed-fixture prototype does not close step 4. This local work cannot close
steps 1 or 3 or authorize rollout. Resolve trusted evidence, upload
recovery and real GitHub permissions before calling the full sharing path ready.

## Core promotion and affected areas

Contributors and maintainers may propose a proven idea; popularity is not automatic
admission. Require demonstrated reuse in multiple apps, a small readable beginner
API, explicit app-owned state, maintainers, provenance and redistribution rights,
attribution, examples, meaningful native/WebFX/browser tests and independent
review. Check name/package collisions and long-term support cost before increasing
core. Core may adapt the idea; preserve old community releases and credits. A
versioned, documented migration is optional and detects duplicate classes; never
silently rewrite imports or pins. Synchronize API guide, app guide, website API
metadata/examples and coverage checks on an actual public API change.

Expected implementation areas: extension setup/auth and sharing actions,
`extension/src/sharing/consumer.js`, `extension/src/web-export/`, sharing
contracts/checker/publisher/catalog, GitHub workflow and App integration,
student-template ignore/build/manifest rules, API/help and ZeroHub documentation,
and native/browser/migration tests. Coordinate shared contracts before edits.
Further contract work must resolve bundle format, exact-size limits, the Blob
publication handshake, compatibility rules and recovery before implementation.
Defer arbitrary transitive dependencies, mandatory updates, automatic expiry,
central mirrors and promotion automation until evidence warrants them.
