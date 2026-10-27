# Publish & open app — local implementation

Worktree /Users/stew/.codex/worktrees/student-explorer/zero, branch
codex/publish-and-open. Owner2026-10-26 requests one Run dropdown action that opens
the latest app: reuse a verified current publication, otherwise publish then open.
Remove standalone Open app/Copy playable link sidebar controls; the browser address
is shareable. Keep palette retrieval commands and ordinary local Run/Stop.

Implementation uses existing clean-main/upload/publication guards and the read-only
host retained-input-to-commit proof. Pending older runs must settle before a newer
publication. Never open on failed/pending/cancelled, account/project drift, or source
edits. Preserve first-publication consent, simulation/no-write behavior and owned locks.
Project-owned publishing README/owner hash remain pinned; UI help changes there would
invalidate existing kits. Update current editor docs instead; no automatic kit upgrade.

Implementation6c31857c is independently reviewed with no remaining findings;
controller55/publisher58 tests and native isolated source-host reuse/open pass
without a new deployment. Final full suite1357pass/3skip, zero failures; npmcheck
and whitespace checks pass. Details and limits: docs/EVIDENCE.md, Publish & open app local completion section. No new push, merge, native release, feed promotion or credential
change is authorized by this request. Public Mac0.5.51 remains the verified release
from PR208/209; source6cdd208e, metadata7253a217, final delivery receipt on PR209.
Preserve primary funding work, normal profiles/student projects, original actor
checkout, immutable assets, Windows21/legacykit17 and production ZeroJams hold.
DeepSeek paused; weekly remaining85%, storage227GB healthy at start. Existing Dev
watchers/user's my-study window stay intact; use a separate source preview for UI.
