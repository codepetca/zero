# Student version control

Owner direction, 2026-11-05: keep branches as the normal workflow and the sidebar
compact. Call the action **Merge**. Name the controls pane **Project** and the
file tree **Files**. Put new, clone and open project actions in the Project header;
file creation stays in the Files header. Students may eventually work on two
active branches; do not impose a branch limit or claim that limitation is already
implemented.

## Approved simplified milestone — 2026-11-07

Owner-approved scope supersedes the earlier implementation direction below. The
sidebar answers: which branch am I on, what changed, and is my work saved on
GitHub? Project contains New/Clone/Open, branch creation and switching, commit
message and Commit, Merge, recent commits, History and compact GitHub status.
Files remains separate, retains file creation and accessible added/modified/
deleted indicators, and opens supported unstaged text changes in the native VS
Code diff. Staged, mixed, deleted and unsupported changes use Source Control.

The first milestone is the complete student journey: open main; create a feature
branch; edit, run and review a native diff; commit locally even offline; sync on
reconnect; merge the clean supported branch into main; reopen and see the merge
in History. Commit attempts automatic upload using guarded transport. Distinguish
local commit, offline and verified GitHub success, and offer explicit Sync. Before
retrying an uncertain upload, check the recorded repository, branch and commit.
If main moved, offer Update from main where supported. On conflicts or unsafe
changes, preserve the work, explain the obstruction and open native Source
Control so the student can resolve, run and return to Merge. Test both normal
journey and stale-main/conflict handoff, with real local Git and production ledger,
and separate native editor, mocked transport and live GitHub evidence.

Use ordinary Git for repository operations, native VS Code diff and conflict UI,
and Zero for the student flow, status and guarded GitHub sync. Preserve existing
identity, destination, data-loss protections and safety gates until relevant paths
are verified. Defer custom discard/removal, whole-project restore, custom conflict
resolution, native displacement/index recovery and a two-active-branch limit.
Preserve narrow verified local-only undo that keeps edits where cleanly supported;
a reviewed corrective Revert for merged changes is follow-up if it blocks the
milestone. Existing prototypes, evidence and uncommitted work are preserved.
No push, publication, deployment or account change is authorized by this scope.

### Current implementation and acceptance

The local implementation follows the approved student flow. Files shows change
indicators, retains file creation and uses VS Code's diff for supported changes.
Commit saves work locally while offline. Failed or uncertain sync retains its
reminder, and explicit status checks and retries use the reviewed destination,
account, branch and commit. Merge records a named merge in Git history so it can
also be seen in a fresh clone. For a new Merge, a native Quick Pick defaults to
deleting the local and GitHub feature branch; unchecking keeps both. The following
Merge confirmation shows the choice, and cancelling either prompt cancels the
merge. Cleanup runs only after remote confirmation and the switch to local main,
checks the exact reviewed tip and other guards, and reports partial or uncertain
outcomes. Changed or uncertain state keeps safe refs. Recovery and Sync keep
branches.
Supported updates remain available. Stale main and unsupported divergent updates
offer **Open Source Control** and preserve the existing files and commits. An
existing managed conflict can still use the guarded completion action once it has
been resolved in Source Control and the index has been verified.

Zero's custom added-file removal is disabled in both development and installed
mode, including when a verified macOS helper is available. Whole-project Discard,
custom file restore including deleted-file restore, project restore,
finished-change correction, and custom conflict choices and cancellation are
also disabled. Recovery inspection and the narrow guarded keep-changes undo
remain available where supported. Physical Windows acceptance remains open.

The focused student lifecycle passed against real local Git, a disposable bare
remote and the production file ledger under OS network denial. VS Code, Run and
the GitHub endpoint were represented by fixtures. The test covered branch
creation, the diff dispatch, repeated offline commits, explicit status review
and retry, a clean Merge, History in a fresh clone, and native Source Control
dispatch on a divergent update. Separate focused checks passed for Files (28/28),
History (20/20), descendant sync UI (30/30), an already-present descendant with
real Git (1/1), and workflow and real divergent handoff (1/1 each). In the final
regression runs, saved sync had 171 passes, 11 existing safety skips and zero
failures. Three additional suites passed 102/102 in a combined run. These counts
are from separate runs. `npm run check` passed.

A native macOS VS Code development host with a trusted disposable local project
confirmed branch creation, a modified-file indicator, the native diff, local
commit and recent-history feedback. In a separate single-window disposable
repository, the local undo action returned main to its parent, preserved the edit
in the index and working file, and retained the commit under a recovery ref.

## Delivery sequence

1. Preserve existing commit/push, switching, recovery, simulation, identity and
   transport safeguards while making branch actions reachable in the compact
   Project pane. Keep **Commit & push** and make the difference between a local
   commit and a GitHub push clear in the relevant status and recovery flows.
2. Provide review and history in an editor tab, with native comparisons and
   existing per-file recovery. Do not modify files merely by opening a view.
   Handle unsaved buffers, renamed/deleted/untracked files and external Git changes
   accurately; offer the native Source Control escape where safe guided handling
   is unavailable.
3. Record a durable boundary and name for future merges in ordinary Git history,
   visible on another clone without a central database. Preserve source files and
   existing guarded transport, provide safe retries after rejected or uncertain
   pushes, and avoid duplicate entries. History must not invent boundaries for
   older fast-forward merges or outside Git actions.
4. Local guarded whole-change undo is implemented with preview and confirmation,
   preserved later work, and a reviewable staged correction. File-level restore
   remains available. Native editor and physical Windows checks remain outstanding.
   Undo behavior: only validated Zero merge markers that are ancestors of
   the current branch are eligible. Require a clean worktree/index and saved
   editors, preview the inverse against the current commit in a disposable Git
   repository, and show affected files. Conflicts or unsupported file types stop
   before modifying the project. A successful undo must preserve later work and
   produce a reviewable correction; never automatically reset or abort over
   external edits. Multi-file application and cancellation are not atomic with
   other processes, and external concurrent changes cannot be guaranteed safe.
5. Evaluate a simple two-active-branch experience separately. Account for external
   branches and work from other computers; do not silently delete or block them.

Use disposable local Git repositories and bare remotes for success, stale-main,
retry, conflict, drift, interruption and fresh-clone coverage. Exercise actual
editor navigation and accessible light/dark layouts where possible; report native
platform and authenticated-flow gaps. Independent review is required under
[AI workflow](AI-WORKFLOW.md). No source push, merge, release or deployment is
authorized by this plan alone.
