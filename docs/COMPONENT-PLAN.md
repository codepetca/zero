# Component lifecycle MVP

Agreed 2026-10-09. Coordinator goal: let students build ordinary Java apps,
consume versioned community components, apply fixes and prepare contributions
with minimal teacher administration. Maven owns dependency resolution; Zero
provides discovery, examples and a readable contribution workflow.

## Authority and boundaries

Follow-up 2026-10-09: owner authorized creating and connecting the public source
remote `https://github.com/codepetca/zero-community`. This supersedes the initial
remote-creation hold below for community source only. Artifact releases, AI
execution, licensing, maintainer appointments and deployment remain separate.

Implement and verify locally. No push, remote repository creation, release upload,
deployment, account changes or deferred live GitHub trial. The separate local
community checkout is `/Users/stew/Repos/zero-community`; its public location is
not configured. Licensing, public distribution and named community maintainers
remain owner decisions before public adoption. Local fixtures are not reviewed
community releases. AI feedback is advisory and must never grant merge/publish
authority or turn generated checks into proof of usefulness.

## Architecture

- Zero core: SimpleApp/SketchApp, ordinary JavaFX controls, explicit updates.
- Community repository: versioned Maven library, sources, examples, contribution
  metadata/checks, generated catalog and release bundles. One library initially.
- Student app: its rules/state and pinned library dependencies, not copied shared
  component source. Read sources separately; edit in a development workshop.
- Workshop: ordinary local Java app demonstrating examples, API, meaningful
  checks and an exportable contribution packet. No new required component base.
- Extension: commands opened on demand for browse/try/add/update/revert. Preserve
  minimal sidebar and existing simulation/individual Git contracts.

## One execution plan

1. Contracts and proof: authoritative student API reference, component
   conventions, local versioned HealthBar library; two consumer apps. Exit:
   real Maven install 0.1.0 → compatible fix 0.1.1 → update → revert, verified
   dependency/source behavior, no copied HealthBar in consumers, old releases
   retained. Generated Maven repository stays ignored.
2. Workshop: preview/example/API/checks and contribution export from one source
   package. Exit: finite behavior checks, runnable local demo, metadata/docs
   consistency and export contents verified.
3. Community pipeline: templates, automated admission and catalog/package checks,
   bounded AI-review interface and maintainer acceptance. Exit: good/bad fixtures
   demonstrate gates, AI cannot self-approve, immutable distribution/provenance
   recorded. External service execution remains separately gated.
4. Zero consumption: on-demand catalog and dependency actions with fixed versions,
   guarded previews, compatibility and preservation of user changes. Exit:
   meaningful add/update/revert/cancellation/drift checks; actual consumer build.
5. Integrate and review: relevant local checks, independent security/correctness
   and architecture/compatibility review, regenerated kit and evidence. Exit:
   locally reviewable source/artifacts, no unresolved blockers, accurate native
   UI/Windows/Linux/hosting/AI limitations.

## Evidence and coordination

Start: codex/component-lifecycle, based on 199c5b0; separate community repo starts
empty. Weekly allowance 47% remaining (account-wide, no attributable task usage).
DeepSeek remains paused through 2026-12-31. Native delegation uses focused fresh
contexts; one writer per component. Requested worker model/reasoning and start,
delivery, verification, rework and integration evidence are recorded in CURRENT.
Effective worker configuration/token telemetry is unknown unless exposed.

Review is high risk because library imports and foundational distribution change.
Two independent Sol/high reviewers at fixed local revisions, separate security
and compatibility assignments. Budget: seven launches, one initial wave, four
targeted waves/fix batches, one final integration wave, 60 minutes elapsed and
30 minutes per reviewer. No PR publication is implied by local review.

## Local completion — 2026-10-09

All five local phases are accepted. Student API is documented; two real apps
consume immutable HealthBar versions through Maven. Workshop builds trusted local
source, previews/checks it and exports a bounded packet. Zero exposes on-demand
Browse/Try/Add/Update/Revert with native guarded POM edits. Admission, release
proof, catalog and offline AI interfaces are prepared; no external service is
configured. Two independent reviews and two bounded fix batches resolved six P2s.
See [verification](VERIFICATION.md) and CURRENT for exact revisions/evidence.
Local artifacts: zero-bootstrap.zip and zero-components.zip in ignored dist/.
Public adoption and untested platform/native flows remain explicitly separate.


## Public workflow — active, 2026-10-09

Owner authorized orchestration/public delivery with "go", keeping it ultra simple.
Existing maintain/admin users of codepetca/zero-community may accept contributions;
automated checks/AI/contributor receipts cannot accept them. No new accounts,
credentials, permissions or repository settings. Preserve unrelated funding work.

Deliver one public HealthBar library 0.1.2 with MIT notices; preserve historical
0.1.0/0.1.1 bytes. Initial public component remains experimental under explicit
owner release authorization; independent human GitHub review is needed before
claiming community acceptance. A contribution without a qualifying maintainer
review waits. Keep existing fork/PR CI read-only and Workshop export source-bound.

One trusted generated manifest in Zero release/community.json comes from community
release receipts and catalog/components.json. No second authored component catalog.
Fixed catalog https://zero.codepet.ca/community/catalog.json; fixed ordinary Maven
base https://zero.codepet.ca/community/maven. GitHub Release assets remain flat;
website maps exact known Maven paths to fixed codepetca/zero-community release
assets, verifies bounded bytes/size/SHA256 before serving and supplies sha1/sha256
sidecars. Unknown paths404; upstream/hash failures refuse bytes/no-store.

Public manifest contract: schemaVersion1, origin public-release,
publication {status:local|published,repository:codepetca/zero-community},
repositoryUrl fixed Maven base, library fixed groupId school.zero.community,
artifactId zero-community, version0.1.2, javaRelease17, javafxVersion21.0.12;
latest, components derived from source metadata, releases array. Each release:
version, sourceRevision (40hex), sourceDigest(64hex), notes, artifacts with four
keys jar/pom/sources/javadoc. Each artifact: exact Maven-relative path, size,
sha256, url (fixed repo/release download tag vVERSION/basename). Optional workshop
record: filename zero-community-workshop-VERSION.zip, size, sha256, same tag URL.
Public manifests contain actual verified published URLs, never guessed availability.

Extension public adapter shares existing POM/native-editor plan guard; public
catalog is default, explicit local selection retained. No new sidebar section.
Try uses trusted bundled example and disposable Maven cache. Public POM is portable.
Workshop ZIP remains portable, with editable community source and verified local
core/community artifacts; no public core migration. One public version initially;
Update/Revert use later real fixes, tested with fixtures and preserved local proof.

Phases: community licensed build/release and authenticated acceptance helper →
review/CI/source merge/public assets → Zero gateway/consumer/portable Workshop →
review/CI/merge/live public Maven consumer → kit0.5.2 publication using publisher.
No artificial second community release or new AI provider. Native OS and classroom
limitations reported separately. Weekly39%remaining; DeepSeek paused through2026-12-31.
