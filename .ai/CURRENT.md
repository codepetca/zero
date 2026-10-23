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
Independent Astra/xhigh review accepted the complete nine-file plan at
eeb0a55481e867910995759bee3e91de29f71bbf
with no actionable findings or required corrections. Reports/receipts:
.verification/zero-first-plan/astra-review/ (ignored); audit is in its parent.
Requested configuration recorded; effective configuration/tokens unavailable.
Prior accepted extension plan at 2bcacd5d remains baseline; the new Zero-first
direction supersedes its default direct-JavaFX UI. See docs/EVIDENCE.md.

Next proposed exemplar phase: smallest concrete facade/lifecycle contracts,
Zero-only app/game, actual managed component consumers and signature evidence.
Retain review details: every supported call/hook reachable in browser fixtures;
App ready after setup/view activation rather than waiting for a game frame;
sanitized PostHog events need explicit grouping/trends/alerts rather than assuming
Error Tracking issue ingestion. No implementation/collection is delivered or
newly authorized by plan acceptance. Preserve prior Actor receipts/source6f0ee4e1.

Retain this attached Actor checkout for continued local planning. Preserve the
primary funding and tutorial-padding Dev work, profiles/scratch/watcher. No push,
PR, merge, deployment, hosted checker activation or credential change authorized.
