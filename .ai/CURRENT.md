# Simpler framework architecture — 2026-10-23

Owner requested revision and Astra review: keep GameApp extending App, remove
GameScreen, retain apps/games, replaceable components, ZeroHub and real WebFX.
Scope is architecture documentation only, no runtime implementation or publication.
Canonical plan: docs/FRAMEWORK-ARCHITECTURE.md; detailed class/ownership model:
docs/FRAMEWORK-MODEL.md; automatic checks: docs/FRAMEWORK-RELIABILITY.md.

App owns common UI/navigation/assets; GameApp adds one gameplay view and one
update/draw loop in Main. Screen is optional UI, World an optional actor
container. GameApp owns canvas/input/camera; ordinary controllers hold level
state and replace default WorldContent. UI navigation suspends gameplay; live
HUD/control composition does not. No new public gameplay-screen base replaces
GameScreen. Existing published/current APIs are unchanged by this plan.

Preserve Zero-first normal signatures, ordinary Java composition, animation
source/playback substitution, real native + pinned WebFX/browser evidence,
managed local/exact-pinned library consumers, credit/immutable versions and the
student-led contribution-to-core loop. Native Run/background checks, runtime
signals and optional sanitized PostHog collection remain as previously planned,
not implemented. UI-only readiness requires no game frame.

Accepted plan revision: 797541f611895d6c020641ddd7f35240719921ad. Independent
requested Astra/xhigh reviewed the complete nine-file diff in 194.9 seconds,
with no actionable findings or required corrections. One initial wave, no fix
batches. Effective model/effort and tokens unavailable. Reports/receipts:
.verification/simple-model-astra/. Previous model review at eeb0a554 is historical
baseline, superseded where it required GameScreen. See docs/EVIDENCE.md.

Checks: npm run check passes; focused website navigation/API/learning tests
30 pass, 0 fail; diff check passes. No runtime/source/API changes or new browser
build. Next proposed phase is the bounded exemplars and smallest contracts in the
canonical plan, including one gameplay view per GameApp, live controls versus
navigation, replacement and managed component export. Plan acceptance is not
runtime/novice/WebFX acceptance or new implementation/publication authority.

Keep this Actor worktree attached. Preserve primary funding and tutorial-padding
Dev work, profiles/scratch/watcher. No push, PR, merge, deployment, hosted checker
activation, analytics configuration or credential change is authorized.
