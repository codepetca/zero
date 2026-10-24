# Zero vision execution — Phase 1C implementation, 2026-10-23

The persistent coordinator goal is active. The single roadmap is
`docs/FRAMEWORK-ARCHITECTURE.md#phased-delivery-and-acceptance`.
Work only in `/Users/stew/.codex/worktrees/actor/zero`; preserve the primary
checkout and other worktrees’ Dev profiles/watchers. Local source, checks,
commits and independent review are authorized. No push, PR, merge, deployment,
release, install, account changes or telemetry activation. Do not repeat stress
benchmarks. Use source-based Zero Dev and focused finite checks.

Phases: 0 baseline; 1 Zero-first Greeting → Study → Coin and a simulation;
2 replaceable components and managed sharing; 3 project-owned builder and pins;
4 automatic diagnostics and executed evidence; 5 journey and release readiness.
No mandatory World, Screen, Camera or ECS. Public publication and physical/novice
acceptance remain separate owner decisions. DeepSeek is paused through 2026-12-31.

Phase 1A is accepted locally through `22b979d6`; handoff `d04dbd93`.
Starter/Greeting 0–2 use Zero UI; TextField, native checks, six actual builds
including earlier failures, final 29 browser assertions and independent review.
See `docs/EVIDENCE.md` and ignored `.verification/vision-greeting-*` receipts.
Public template pins, installed kits and hosted website remain unchanged.

Phase 1B source is `81872502`: Study lessons/checkpoints 3–7 use Zero UI and
ordinary callbacks; `Element.setEnabled(boolean)` adds the only public member
(14 helpers / 165 declarations). Quiz state guards remain explicit. The native
harness unwraps Elements while retaining older checkpoint compatibility.
Focused native UI and sequential checkpoints 3–7/9 pass, as do lesson/API,
semantic, root checks and local `/docs` HTTP200 with setEnabled.

Initial independent Sol/high review of all 23 changed files found one P2:
pinned WebFX did not propagate disabled state from a Column to descendants.
Fix batch 1 is committed as `7f8235ff` (seven files). Browser-only per-node
ZeroDisabledState observers repair computed inheritance while preserving each
node’s own flag, following parent/children/root changes; native source and public
API stay unchanged. Runtime collisions and forged javafx packages are rejected.
Thirty API/adapter tests, syntax/profile/semantic checks and root check pass.

Browser receipt `.verification/vision-study-web/receipt.json`: four actual builds
in total; prior two/43 assertions archived under `prior-43-pass/`; new two builds
pass 52/52 assertions, real ancestor typing/click/Tab blocking, re-enable and
independent child flags, initial disabled mount, and two full Study sessions with
two resets. Exact consumer/runtime/export hashes retained. Own browser/previews
closed. Raw console audit confirms two optional favicon 404s and one test pixel-readback
warning; no application/required-resource errors. Phase 1B is accepted locally.

Phase 1B independent targeted review is clean, retaining initial coverage.
Two turns / one initial and one targeted wave / one fix batch; receipts are in
`.verification/vision-study-review/`. No extra builds or review waves needed.

Active Phase 1C contract: migrate Coin lessons/checkpoints 8–9 to Zero packages.
Add only zero.Key arrow constants and held/edge GameApp overloads, plus zero.ui.Row
with Column-equivalent spacing/ownership behavior. Use existing Color.rgb and
showGame on restart. Keep ordinary Player/Coin coordinates and explicit updates;
no Actor migration, Mouse API, palette expansion, asset or camera API in this slice.

Current owner lanes:
- Coordinator: integration, roadmap/product/evidence/CURRENT and Git commits.
- vision_workflow_audit (retained Sol/high): API writer for Key, GameApp input
  overloads, Row, exact contracts/fingerprints/assembly, API/website docs/tests,
  native checks and focused browser input fixture. No stage/commit/heavy builds.
- Coordinator: lessons08/09, checkpoints8/9, lesson-projects test and integration.
- actor_browser (retained Sol/medium): idle after accepted Study proof; reuse for
  focused Coin/input browser acceptance after source freeze.
- actor_stress_review (retained Sol/high): idle; independent Coin slice review
  after checks. Phase 1B budget is complete and preserved.

Next: finish API and lesson edits, cheap checks, native checkpoints8/9 and input/UI,
then focused browser proof and independent review. Do not mark the goal complete.
Starting weekly usage was 7% used and storage 271.779 GB free; shared readings
are not task cost. Latest storage 265.744 GB, healthy. Effective configuration
and attributable tokens remain unknown.
