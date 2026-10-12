# ZeroHub: automated publication plan

Owner decision, 2026-10-11: anyone signed in may contribute. A trusted automated
checker enforces minimum standards; passing versions become available without
maintainer acceptance. This replaces the earlier proposed human acceptance gate
for the new hub. It does not authorize deployment, publication of current local
artifacts, automatic source-repository merges or disabling existing implementation
guards. The hub/checker/publisher are implemented and verified locally; hosted activation and the outstanding independent checker review remain separate gates.

## Student identity and flow

Student chooses a component class name. The hub assigns a short permanent library
ID, such as ui7, before preparing/compiling the separate library project. Java
namespace zero.ui7 holds related classes; neither GitHub usernames nor release
versions appear in its namespace. Owner identity is linked to the authenticated
GitHub account in the database. Published namespace reservations stay fixed through
updates, renames and ownership transfers. Categories/tags organize discovery and
are separate from Java names. Maintained Starter UI source uses `zero.starterui`; the hub fixture adapts it to the assigned namespace.

Build locally → prepare library → preview/check → submit exact source → trusted
hub checks → automatic publication/listing if passed. Failed, unsupported or
unverified submissions receive a clear report and remain unavailable. No routine
maintainer approval or teacher fallback queue. Students consume exact Maven
versions through Add library; later releases do not change installed pins.

## Minimum checker contract to implement

| Gate | Required evidence |
| --- | --- |
| Ownership and naming | Authenticated submitter may release this reserved library; valid Java names and exact declared classes. |
| Build and dependency policy | Supported Java/JavaFX targets; approved pinned dependencies and trusted build configuration; no submitted publishing hooks. |
| Reuse and examples | Two complete runnable consumers resolve the exact built JAR and finish bounded smoke/behavior checks. |
| Behavior | Required hub-owned contract checks plus meaningful declared tests exercising actual components, including updates, reset, independent instances and error cases where applicable. |
| Documentation and licensing | Short API/usage card, visual preview for visual components, examples, changelog and MIT/upstream notices. |
| Release integrity | Source commit/digest, checked JAR/source/POM bytes and checksums, version/namespace immutability; tested platforms explicitly identified. |

These are executable acceptance criteria to develop, not claims that an arbitrary
component already satisfies them. Tests establish the behaviors they exercise;
they cannot prove all possible uses, usefulness, absence of malicious behavior or
all-platform support. Contributor-authored passing flags/CI logs are not authority.
The hub generates and verifies its own source/artifact-bound result.

## Execution and publication boundary

Remote contributor builds/checks run in disposable isolated workers with bounded
time, memory, output and network access; no host data, repository-write access or
publishing credentials. They use hub-controlled build/test policy rather than
contributor workflows. Local previews run trusted Java with normal permissions; submitted code runs only in the isolated checker. The initial supported component capabilities/dependencies must be defined
and enforced before open publishing is enabled.

A separate trusted publisher verifies ownership, checker policy/version, exact
source and artifact hashes, and a complete passing result; it publishes those
bytes without rebuilding or executing candidate code. Concurrency/retry checks
prevent replacing an existing version or publishing unchecked drifted artifacts.
Publication jobs are system operations, not credentials given to students/tests.

## Discovery and status

Passing releases are labeled Automatically checked, with test scope/platforms and
reports visible. They are not labeled human-reviewed or guaranteed safe/useful.
Checked versus recommended versus promoted into core remain distinct. Optional AI
can summarize/explain findings; it is not required to grant publication authority.
Usage signals, recommendations and reporting/deprecation can improve discovery
after minimum compliance. Core/editor/framework repository changes retain their
separate source review and owner-authorized publication workflow.

## Consolidation and next evidence

Zero owns all platform and maintained sample source. ZeroHub lives at `/hub`, with backend routes `/api/hub`. The old separate Community catalog, Workshop and maintainer admission path are removed without compatibility redirects. Student library source remains in students' repositories; uploaded artifacts belong in database/storage, not Zero's Git tree.

Verify single-repo native consumers and the complete local prepare/download/upload/check/list/Add/Update/Revert flow. Preserve contributor attribution, immutable versions and independent library histories. Complete the outstanding checker review before hosted activation. No live credentials, deployment or public publication are implied by local verification.
