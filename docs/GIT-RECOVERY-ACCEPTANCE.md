# Git recovery acceptance

Status2026-10-26: implemented locally; all 30 non-PR scenarios have now been
exercised through the actual Mac interface after owner unlock. No blocking
work-preservation failures were found; two wording observations remain below.
PR integration, source publication,
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

Actual production Git APIs executed all 30 non-PR rows with disposable student/peer
repositories and bare remotes. Backend29passed; busy was backend-partial and its
actual Mac progress/duplicate-action/release check passed. Service failures were
injected at a constrained transport boundary. This is not live GitHub expiration,
permission or school-network acceptance. Java/API/WebFX source is unchanged.

Actual Mac controls used an isolated QA profile. All 30 non-PR rows now pass their
functional checks, with wording limitations on dirty signed-out/local-only work
and account-change guidance. Reconnection-ready and main fast-forward wording
were observed in the reviewed source. Native Run evidence means App UI ready
and Stop, not JavaFX button gameplay. Four PR-only states are deferred.

## Scenario matrix

| Scenario | Disposable Git / backend | Mac interface |
| --- | --- | --- |
| Edit and push on main | Passed | Passed |
| Create a local branch | Passed | Passed |
| Edit and push a feature | Passed | Passed |
| Saved remote feature | Passed | Passed |
| Saved remote main | Passed | Passed |
| Clean project / no new file changes | Passed | Passed |
| Main behind remote | Passed | Passed |
| Main diverged from remote | Passed | Passed |
| Text conflict on main | Passed | Passed |
| Feature needs main update | Passed | Passed |
| Text conflict on a feature | Passed | Passed |
| Checkpoint before Update | Passed | Passed |
| Modify/delete conflict | Passed | Passed |
| Binary PNG conflict | Passed | Passed |
| Same feature changed on another computer | Passed | Passed |
| Remote main advances during Merge | Passed | Passed |
| Complex rename / native fallback | Passed | Passed |
| Source changes during Update | Passed | Passed |
| Network failure after local save | Passed | Passed |
| Expired sign-in | Passed | Passed |
| Access refused | Passed | Passed |
| Push accepted; confirmation interrupted | Passed | Passed, including newer native local commit |
| Main requires PR / native guidance | Passed | Passed |
| Account changes during operation | Passed | Passed |
| Checkpoint before Switch branch | Passed | Passed |
| Signed-out local work | Passed | Passed |
| No connected remote | Passed | Passed |
| Pending operation / repeat actions | Held fetch passed; UI locking checked on Mac | Passed |
| Compiler error and correction | Passed | Passed |
| Direct Merge completion | Passed | Passed |

Clean pushes may make an idempotent nonforce push followed by exact confirmation;
they create no empty commit. Native Switch checkpoint cancellation, approval and
the supported native Git picker were exercised on the Mac. Tracked and untracked
work remained on the original branch, with no upload.
PR-ready/review/checks/requested-changes/merged-PR integration remains deferred.

## Completed continuation and limits

After owner unlock, the remaining 17 rows and the interrupted-confirmation row
were completed using Mac typing/clicking. The latter made a newer native local
commit before checking the earlier upload: Zero confirmed the original SHA, made
no repeat push, retained newer local HEAD/source/status and refreshed only remote
tracking metadata. An initial verification assertion expected all refs unchanged;
that assertion was corrected to allow this documented tracking refresh.

The real Java compiler failed on Broken.java, Show Problems exposed its location,
the file was corrected in the Mac editor, Run reached App UI ready, and explicit
Commit & push confirmed the corrected source. A real nonforce merge rejection
after remote main advanced recovered through Update from main, Run/Stop and Merge.

A separate live existing-session happy-path smoke used the existing owner-owned
disposable [GitHub pilot](https://github.com/armorup/zero-git-flow-pilot-20261025).
Reviewed current source passed Update, local New branch, Mac source edit, native
Run/Stop, Commit & push and Merge. Local main, origin/main and both GitHub main
and pilot-recovery-20261026 resolve to
`ba318d05203466744f0366a37bb7bc89735a975a`. Local feature cleanup completed; the
remote feature remains. GitHub refs were independently read through its API.
Original my-greeting was reopened at unchanged clean main2909872c. Source and
release repositories were not pushed. No PR, website or app was published.

Two nonblocking UX observations remain for a small follow-up:

- Dirty New branch says Commit & push first even while signed out or without a
  remote. The guard preserves work, and native local commit or an explicit local
  checkpoint enables branching, but the message should explain that route.
- An account change during dispatch initially says the project changed. Checking
  status then gives the precise account-changed error and refuses the wrong account.

The service-failure cases remain constrained injections around real disposable
Git/bare repositories, not live GitHub expiration/permission/branch-rule evidence.
The live happy path does not change that boundary. Native Git credential-adapter
transfer remains OFF/unproven. PR-only integration, physical Windows, Git2.31
binary, minimum VSCode, fresh Mac and school-network acceptance remain separate.
The owner confirmed this connection is not the school network.

Raw fixtures, before/after hashes, command/fault traces, reviews and native receipts
are ignored under `.verification/git-recovery-flow/`, especially mac-results.json,
mac-resumed.ndjson, live-before.json, live-after.json and uncertain-*-check.json.
Initial gallery adapter failures and QA harness incidents remain recorded. Source
code645504c is unchanged, so its completed independent review and 1,277 pass/3 skip
suite remain applicable. PR integration, source PR/CI, publishing and releases
need their separate authorization.
