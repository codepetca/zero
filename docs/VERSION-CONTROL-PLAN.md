# Student version control

Owner direction, 2026-11-05: keep branches as the normal workflow and the sidebar
compact. Call the action **Merge**. Name the controls pane **Project** and the
file tree **Files**. Put new, clone and open project actions in the Project header;
file creation stays in the Files header. Students may eventually work on two
active branches; do not impose a branch limit or claim that limitation is already
implemented.

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
4. Only after those boundaries and recovery are proven, design and implement a
   whole-change undo with an explicit preview, conflict handling, preserved later
   work, and a reviewable new change. File-level restore remains available. This
   future phase is not implied by a read-only history screen.
5. Evaluate a simple two-active-branch experience separately. Account for external
   branches and work from other computers; do not silently delete or block them.

Use disposable local Git repositories and bare remotes for success, stale-main,
retry, conflict, drift, interruption and fresh-clone coverage. Exercise actual
editor navigation and accessible light/dark layouts where possible; report native
platform and authenticated-flow gaps. Independent review is required under
[AI workflow](AI-WORKFLOW.md). No source push, merge, release or deployment is
authorized by this plan alone.
