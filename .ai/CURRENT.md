# Zero shared GitHub identity — 2026-10-18

Owner chose ONE Codepet GitHub App for desktop Zero and ZeroHub. Canonical plan:
docs/ZERO-IDENTITY-PLAN.md. GitHub identity, selected+App-created repositories,
local offline Run, ordinary Java, minimal UI and separate Pika submission remain.
Browser/editor have separate credential families; browser tokens can inherit the
selected repository authority. No pairing or broad native OAuth fallback.

Implementation and one remediation batch are complete locally in
/Users/stew/.codex/worktrees/zerohub-simplify/zero, branch
codex/zerohub-project-feedback. Reviewed codehead1548a0e from baseline4fbcfe2.
Two independent initial reviews, Astra/high targeted correction review and
Sol/high cumulative integration review: no unresolved source blockers. Four
launches, one fix batch, within original budget; receipts in
.verification/zero-identity/plan.json and tracked docs/EVIDENCE.md.

Exact codehead:598extensiontests,597pass0fail1existing skip;148website tests,
typecheck/finalbuild/rootcheck pass. Native UI unavailable while Mac locked;
live App consent/install/create/private clone/refresh/revocation/upload/Pages/stars,
physical Windows and Safari unverified. New recovery guide must publish before
activation. Pinned App configuration remains honestly unconfigured.

NEXT: concrete owner approval for App registration/permissions and external
publication/activation, then approved live acceptance. No new App/secret/GitHub
write/push/merge/deploy/native release performed. PR102 remains the earlier draft
at4fbcfe2; its fourCIchecks are baseline only. One App supersedes the old star-only
activation proposal. Published installer0.5.19 and publisher policy11c5451 unchanged.
Preserve dirty main funding work and ignored evidence/profiles. DeepSeek paused
through2026-12-31; account-wide56% weekly remaining at start is not task cost.
