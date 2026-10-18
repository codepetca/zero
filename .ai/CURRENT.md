# Zero shared GitHub identity — 2026-10-18

Owner requested plan+orchestration and explicitly chose ONE Codepet GitHub App
for desktop Zero and ZeroHub. GitHub is the identity provider. Selected existing
repos plus App-created repos; no all-repos requirement or broad native OAuth
fallback. Preserve local offline Run, ordinary Java, minimal UI, public browse/
Play, student-owned repositories and separate Pika submission.

Canonical execution plan: docs/ZERO-IDENTITY-PLAN.md. Coordinator owns architecture,
interfaces, extension.js, config/docs/integration. Sol/high native/security
investigations and native modules complete; initial regression575pass/1skip and two independent reviews complete; six
accepted fixes in one batch now undergoing final checks and targeted review. Runtime ownership, receipts and
review budget live in .verification/zero-identity/plan.json. One writer per file.

One App means web tokens can inherit selected-repository authority; owner chose
this tradeoff after it was explained. Native device refresh can remain local,
without a shipped/server App secret. Keep token families separate. Omit broad
Administration: initial Pages setup may require GitHub settings then recheck.
Provider creation/permissions, secrets, activation, push/merge/deploy and native
publication need concrete owner approval after review. Earlier star-only App
activation question is superseded; no live App/secret exists.

Worktree /Users/stew/.codex/worktrees/zerohub-simplify/zero, current branch
codex/zerohub-project-feedback base4fbcfe2. PR102 remains draft: original147tests,
typecheck/build/rootcheck and all4CI passed; new website148tests/rootcheck/recovery23 pass; full extension integration pending.
Mac is locked: native CUA smoke unavailable; no live App or physical Windows test.
Account-wide weekly56% remaining; storagehealthy~310GB; DeepSeekpaused through
2026-12-31. Preserve dirty main funding work and ignored earlier evidence/profiles.
Prior authorPR101 merged41ba316; publisher policy11c5451 and installer0.5.19 stay
unchanged. Public projects DrawingPad/GroveGuard; SkyHopwithdrawn.
