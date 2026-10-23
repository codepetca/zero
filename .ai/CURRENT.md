# Zero-first framework model and reliability — 2026-10-23

Owner clarified: normal student game/app development uses Zero packages almost
entirely; JavaFX remains underneath and available for advanced interoperability.
Requested complete hierarchy/ownership design, App versus GameApp clarification
and automatic failure detection; later asked to consider PostHog alongside Clarity.
Current scope is architecture/documentation and read-only source/provider research.
No runtime implementation, collection, publication or account changes.

Canonical plan: docs/FRAMEWORK-ARCHITECTURE.md, with detailed
FRAMEWORK-MODEL.md and FRAMEWORK-RELIABILITY.md. App is the shared host;
GameApp is a thin default-game convenience. Screen/GameScreen, explicit World
content, Actor behavior/playback and Zero UI use one lifecycle driver. Zero
facades do not expose JavaFX types on normal signatures; advanced bridge and
published API/library migrations remain explicit. Proposed APIs are not delivered.

Read-only Sol/medium audit found existing source/API guards, compiler/source
diagnostics and six-fixture real browser CI. Current native Run has no browser
check; preview frame failures are not bridged to failed editor state; ZeroHub
checks reachability only. No source-managed Clarity/PostHog field collector.
Plan adds per-signature evidence, saved-source compatibility, truthful local
runtime signals, failure injection and optional sanitized operational events.
PostHog is recommended for evaluation as primary optional sink, Clarity for
supplementary website UX. No automatic tracking injection into student games.

Checks: npm run check passed; focused website navigation/API/learning30pass/0fail.
Next: independent Astra/xhigh review of the fixed model/reliability revision,
resolve material findings and record evidence. Prior accepted extension plan at
2bcacd5d and receipts under .verification/architecture-extension-astra/ remain
baseline; the new Zero-first direction supersedes its default direct-JavaFX UI.
Audit receipts: .verification/zero-first-plan/ (ignored). Preserve existing
Actor receipts and source6f0ee4e1; no new public API/runtime change.

Retain this attached Actor checkout for continued local planning. Preserve the
primary funding and tutorial-padding Dev work, profiles/scratch/watcher. No push,
PR, merge, deployment, hosted checker activation or credential change authorized.
