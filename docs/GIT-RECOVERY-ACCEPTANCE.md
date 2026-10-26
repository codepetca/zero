# Git recovery acceptance

Status2026-10-26: implemented locally; Mac acceptance remains incomplete because
the Mac locked and requires owner unlock. PR integration, source publication,
publishing and releases remain separate. Reviewed code: `645504c7b0f596d7f2867a1bd1b2ec25473ae663`,
base `7e97103c074a43c1f338ab1734562a590ae02a8e`.

## Implemented behavior

Update from main combines committed local/main/feature histories; Update branch
from GitHub separately gets the same remote feature. Neither uploads. Explicit
local checkpoints protect uncommitted work before Update or native Switch. Text
choices apply one conflicting section at a time and retain automatic merges.
Binary/deletion choices apply to a whole file. Read-only comparisons, persisted
managed conflicts, guarded Cancel and native fallback preserve a simple sidebar.

Managed cancellation requires independently verified merge-produced bytes, modes,
index, refs, ignored paths and merge markers. Concurrent or unverifiable results
stay available for native review. Cancel refuses later edits; active legacy unsafe
records are not accepted. Normal native resolution/abort refreshes Zero controls.
No required central database/storage, forced push or silent history reset exists.

Saved-push errors distinguish behind/auth/access/network/protected/uncertain states.
Exact status checking reads the originally recorded SHA even after newer local
commits and edits. Reconnection keeps account/project guards, offers a manual retry
and never uploads automatically. A fast-forwarded main needs no additional push.

## Verification boundaries

Final code645504c: root1277passed,3existing skips; focused UI/auth/gallery55passed;
configuration/syntax/command/link checks pass. Independent initial Astra/high and
Sol6.1/high reviews, followed by two targeted passes (Astra/high and Sol6.1/high),
have no remaining source blockers. Four reviewer turns, two correction batches.
Effective configurations, individual elapsed time and token usage were not exposed.

Actual production Git APIs executed all30non-PR rows with disposable student/peer
repositories and bare remotes. Backend29passed; busy was backend-partial and its
actual Mac progress/duplicate-action/release check passed. Service failures were
injected at a constrained transport boundary. This is not live GitHub expiration,
permission or school-network acceptance. Java/API/WebFX source is unchanged.

Actual Mac controls used an isolated QA profile.12rows passed, one interrupted-
confirmation row is partial,17rows remain unattempted. The final reconnection-
ready wording also needs native smoke after unlock. Native Run evidence means
App UI ready and Stop, not JavaFX button gameplay. Four PR-only states are deferred.

## Scenario matrix

| Scenario | Disposable Git / backend | Mac interface |
| --- | --- | --- |
| Edit and push on main | Passed | Passed |
| Create a local branch | Passed | Pending unlock |
| Edit and push a feature | Passed | Pending unlock |
| Saved remote feature | Passed | Pending unlock |
| Saved remote main | Passed | Pending unlock |
| Clean project / no new file changes | Passed | Pending unlock |
| Main behind remote | Passed | Passed |
| Main diverged from remote | Passed | Passed |
| Text conflict on main | Passed | Passed |
| Feature needs main update | Passed | Pending unlock |
| Text conflict on a feature | Passed | Passed |
| Checkpoint before Update | Passed | Passed |
| Modify/delete conflict | Passed | Passed |
| Binary PNG conflict | Passed | Passed |
| Same feature changed on another computer | Passed | Passed |
| Remote main advances during Merge | Passed | Pending unlock |
| Complex rename / native fallback | Passed | Passed |
| Source changes during Update | Passed | Pending unlock |
| Network failure after local save | Passed | Passed |
| Expired sign-in | Passed | Pending unlock |
| Access refused | Passed | Pending unlock |
| Push accepted; confirmation interrupted | Passed | Partial: final confirmation text pending |
| Main requires PR / native guidance | Passed | Pending unlock |
| Account changes during operation | Passed | Pending unlock |
| Checkpoint before Switch branch | Passed | Pending unlock |
| Signed-out local work | Passed | Pending unlock |
| No connected remote | Passed | Pending unlock |
| Pending operation / repeat actions | Held fetch passed; UI locking checked on Mac | Passed |
| Compiler error and correction | Passed | Pending unlock |
| Direct Merge completion | Passed | Pending unlock |

Clean pushes may make an idempotent nonforce push followed by exact confirmation;
they create no empty commit. Native Switch uses production checkpoint plus the
supported native Git picker; its physical interaction remains in the pending rows.
PR-ready/review/checks/requested-changes/merged-PR integration remains deferred.

## Remaining Mac acceptance

Unlock the Mac, reload the owned QA window to current source, then finish the
pending rows and the interrupted-confirmation text check. Source and original
projects remain preserved. The existing user project and public pilot HEAD/status
match their baselines; no source push, PR or release occurred. Keep fixture-only
credentials/transport confined to QA; finish a live existing-session disposable
GitHub smoke separately before claiming current live-service acceptance.

Raw fixtures, before/after hashes, command/fault traces, reviews and native receipts
are ignored under `.verification/git-recovery-flow/`. Initial gallery adapter
failures and QA harness incidents are retained, rather than counted as passes.
Physical Windows, Git2.31 binary, minimum VSCode, fresh Mac and school networking
remain separate acceptance limits.
