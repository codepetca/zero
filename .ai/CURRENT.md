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
activation. Public App configuration is now pinned to the verified registration.

Owner approved registration, draft push, and a private test repo with installation
limited to it. Codepet Zero registered undercodepetca: App5367740,
clientIv23liWzC8OE2WN5f6qV, slugcodepet-zero. Real public API/verifyApp pass exact
binding and permissions. Chrome owner confirmation succeeded; the approved private test repository was
created from the trusted starter and is the only selected installation repository.
Exact private test IDs remain in the ignored receipt. No private key/clientsecret generated. Userauthorization,
clone/upload/refresh/revocation/Pages/stars unverified; production/native release
and merge not newly authorized. Selected install requires≥1repo; empty-account
onboarding still an acceptance gap.

NEXT: review public-ID pin/config-fixture/docs delta, update draft PR102 (all5CI
passed at474fe06); perform approved one-repo native acceptance when available.
No server credentials/production activation/native release. Preserve dirty main,
ignored evidence and released installer0.5.19/publisher policy11c5451.
DeepSeek paused through2026-12-31; last weekly51% remaining is account-wide.
