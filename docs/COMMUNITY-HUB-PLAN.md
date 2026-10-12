# Community hub: automated publication plan

Owner decision, 2026-10-11: anyone signed in may contribute. A trusted automated
checker enforces minimum standards; passing versions become available without
maintainer acceptance. This replaces the earlier proposed human acceptance gate
for the new hub. It does not authorize deployment, publication of current local
artifacts, automatic source-repository merges or disabling existing implementation
guards. The hub/checker/publisher are not implemented yet.

## Student identity and flow

Student chooses a component class name. The hub assigns a short permanent library
ID, such as ui7, before preparing/compiling the separate library project. Java
namespace zero.ui7 holds related classes; neither GitHub usernames nor release
versions appear in its namespace. Owner identity is linked to the authenticated
GitHub account in the database. Published namespace reservations stay fixed through
updates, renames and ownership transfers. Categories/tags organize discovery and
are separate from Java names. The local Starter UI prototype retains its existing
namespace until a separate scoped naming migration.

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
contributor workflows. The current local Workshop runs trusted Java with normal
permissions and cannot become this remote checker merely by removing its approval
step. The initial supported component capabilities/dependencies must be defined
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

## Migration and next evidence

Existing health-bar admission/acceptance helpers still implement the prior human
policy and cannot admit arbitrary Starter UI today. Replace that path deliberately
with the generic source descriptor, isolated trusted checker and publisher after
independent review; preserve legacy catalog endpoints and immutable artifacts.
Prove valid automatic acceptance, useful failure reports, stale/forged receipts,
source/artifact drift, version races/retries and worker/publisher isolation using
local fake publication first. No live hosting or credentials changes in this plan.
