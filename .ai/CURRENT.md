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

Next: run configuration/links and focused website tests, commit a fixed revision,
then independent Astra/xhigh full-diff review. One reviewer, one initial wave,
up to four targeted correction waves/batches, 60min session/30min reviewer caps.
No source/runtime build is warranted for this documentation-only delta. Retain
prior source/audit receipts; previous model review at eeb0a554 is historical
baseline, superseded where it required GameScreen. Final evidence belongs in
docs/EVIDENCE.md; new review receipts under .verification/simple-model-astra/.

Keep this Actor worktree attached. Preserve primary funding and tutorial-padding
Dev work, profiles/scratch/watcher. No push, PR, merge, deployment, hosted checker
activation, analytics configuration or credential change is authorized.
