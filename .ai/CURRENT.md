# Student-led framework evolution — 2026-10-23

Owner approved a core goal: students extend/replace components, share exact
versions on ZeroHub, reuse/improve them and propose proven ideas for Zero core.
Implementation in this turn is documentation only. Canonical plan:
docs/FRAMEWORK-ARCHITECTURE.md; product, repository architecture, components,
component plan, game-system notes and AGENTS carry the same direction.

Proposed structure: JavaFX host, optional active screens, explicit World/content
updates and JavaFX UI. Small public replacement contracts support animation and
alternative structures; core owns lifetime/sequencing. No universal node tree,
source patching, auto registration or required component base. Browser delivery
through pinned WebFX to playable GitHub Pages remains a hard product goal.
Proofs: missing steering helper, substituted animation and container, one shared
App/GameApp component through managed source-library export, then authorized
Pages/novice acceptance. Interfaces, controls, metadata and World/Screen additions
are proposals, not implemented APIs. Existing hosted checker/release gates remain.

Plan accepted at2bcacd5d382a748a59dad74f6bf75a59c6bfdd61 after an independent
Astra/xhigh full-diff review and one targeted follow-up. One P2 preservation
contradiction was corrected; retained-session deactivation versus disposal was
clarified in the same batch. No remaining actionable findings. Receipts/reports:
.verification/architecture-extension-astra/; prior reference review remains in
.verification/architecture-astra/. Requested configuration is Astra/xhigh;
effective configuration and token usage were not exposed.

Checks: configuration/syntax/command contracts/local links pass; focused website
document-navigation/API-reference/learning tests30pass/0fail; diff check passes.
Next proposed phase, when scoped: design the three examples and smallest
contracts, including repeated animation assignment, resource ownership and
drawing capability. Plan acceptance does not authorize that implementation.
See docs/EVIDENCE.md for review coverage and remaining empirical gates.

Runtime remains Actor prototype source6f0ee4e1 / prior receiptc7ffa40a, with its
recorded native/WebFX/browser/source checks. No new runtime, public API or binary
change. No push, PR, merge, deployment, ZeroHub activation or credential change is
authorized by this task. Preserve primary funding and tutorial-padding Dev work,
profiles/scratch/watcher and all unrelated changes. Retain this attached Actor
checkout and ignored receipts for the next scoped implementation phase.
