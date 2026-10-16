# Current state — one lead, browser-first migration planned, unreleased

## Goal and scope

Make Zero a local Java teaching kit whose primary app target is the browser:
ordinary student Java and approved ordinary JavaFX APIs → Run App checks and
compiles locally → responsive browser preview → GitHub section Publish app →
verified Open/Copy playable link on student-owned GitHub Pages. ZeroHub links to
that live app; versioned source and Pika repository links remain separate. Keep
explicit object updates, useful errors, simple publishing and bounded storage.
Cloud development, hosted compilation and an online playground are out of scope.

Coordinator: **Lead publishing task**, thread
`01a13f98-55fc-7471-9038-1198b14d5a98`. One coordinator, with bounded native
subagents here when useful; no competing user-visible implementation chats.
Existing chats cannot literally convert into native subagents. Their handoffs
and completed changes are retained below; future work uses focused worker briefs.

Worktree `/Users/stew/.codex/worktrees/web-export/zero`, branch `codex/web-export`.
Reviewed runtime code `5381b4d47823ccafa303123a4acb58576cda7d24`; baseline closeout
`3a13ce0`. This consolidation changes plans only. Root funding checkout, original
game, installed Zero and published releases remain untouched.

## Current status and next phases

The previous optional-export/publishing baseline is locally implemented, reviewed
and tested. The newly agreed browser-first Run App, strict resolved-member gate
and deployment of local builds are NOT implemented. The old statement that only
publication authorization remains applies to that previous baseline, not this
expanded direction. Detailed plan: `docs/WEB-EXPORT.md`, Planned browser-first
migration; product/development docs distinguish current and planned behavior.

1. Establish the shared validated snapshot, versioned compatibility contract,
   owned-preview lifecycle and supported local-bundle upload transport.
2. Browser-first Run App: save/check/local build/fresh-output validation/preview;
   real Stop/restart/cancel of executing JavaScript and audio. Reuse exporter.
   Publish the same validated local snapshot; migrate current Actions compilation
   to deployment-only. Optional native diagnostic launch must be explicit.
3. Strict compatibility: resolve approved constructors, methods and fields,
   inherited calls/references and relevant Java APIs/dependencies in all original
   application code, including dead code. Useful source diagnostics plus real
   pinned WebFX/GWT compilation. Current fingerprints/lexer checks are insufficient.
4. Combined regression, source-drift/lifecycle/deployment checks and independent
   review; then authorized live Pages/ZeroHub acceptance and coordinated release.

Future worker boundaries: browser-run owner (extension lifecycle), semantic-check
owner (contract/checker), and game/regression reviewer (fixtures/evidence). Agree
shared interfaces first; one writer per component. No worker needs to run merely
to replace an archived chat. Coordinator owns integration, authorization and
acceptance. This request authorizes consolidation and plan updates, not external
publication or a new implementation wave for the browser-first direction.

The existing tool-backed goal is blocked on live-publication authority; it is not
complete or paused. Its recorded objective predates this expanded migration;
this handoff records the new direction without creating a second goal. Real
GitHub account/repository selection, workflow permission, push/upload/deployment
and release still need explicit authority. Preserve the separate ZeroHub library-
checker acceptance hold; no policy activation is authorized by this plan.

## Consolidated source-chat handoffs

Owner requested consolidation/archiving on 2026-10-15. All three chats were idle,
with no active implementation writers, before archive. Archive chat history only;
retain all source, branches, worktrees, local evidence and recoverable histories.
All three archive operations confirmed success. Their work is consolidated here;
no new user-visible tasks or placeholder subagents were created. Consolidation
verification: `npm run check` and `git diff --check` passed; runtime code unchanged.

- **Assess WebFX-safe JavaFX wrappers** —
  `01a14040-adb3-7393-81da-ac925fb8b727`. Latest human instruction confirmed
  browser-first Run App and strict compatibility belong in this lead's plan,
  using the existing WebFX/GWT pipeline and local compilation; cloud development
  excluded. No replacement TeaVM pipeline or per-control wrapper DSL approved.
- **Assess WebFX compatibility and app** —
  `01a13f9f-ccfd-7731-8bc7-285d1d775d83`. Read-only historical analysis retained
  at `/Users/stew/Repos/zero/docs/WEB-PUBLISHING.md` and root
  `.verification/webfx-2026-10-15/`. Its five-helper/audio gaps and native-first
  assumptions are superseded by integrated audio and the new plan. Preserve the
  dirty root notes selectively; do not wholesale import or overwrite them.
- **Build Flappy Bird with Zero** —
  `01a13d75-377e-7201-98c5-cc1c2c0387f5`. Clean unpublished branch
  `codex/student-game-helpers`, commit `dbaef8c0ea44aebcb137ddb7351f030ed8dd0b17`,
  worktree `/Users/stew/.codex/worktrees/student-game-helpers/zero`. Integrated
  here as `b7ece386fc5ca8f4d652435a3bdd16a4bce7c763`; only CURRENT conflicted,
  preserving the coordinator plan. Seven canonical classes/98 declarations kept.

Original game `/Users/stew/Repos/zero-flappy-bird` is not Git; preserve it and
`/Users/stew/Repos/zero-flappy-bird.zip` (11,752,706 bytes, SHA256
`66b20743c2ba310f572197714a7e01ff1a430e682989894285d367c63eed47f8`). Frozen
fixture `.verification/integration/latest-sky-hop` and snapshot.json preserve
95 files; canonical helpers match dbaef8c. Original game/assets unchanged.
Game worktree evidence: `.verification/audio-helpers/remediation-source.json`
(58-file manifest, zero drift at handoff), core-remediation.md and review-remediation.md.

Preserve Sky Hop's 480×680 design, ready-only title/start prompt, 90×72 bird,
radius15, pipe spacing280/gap168, four poses at12fps, 701×561 cells/lower row y531;
Space/click flap, P pause, R reset, M mute and focus suspension. Preserve art,
17.14-second music and effects. Physics/states/scoring remain ordinary Java.
Native handoff passed57 core audio assertions,194 game-rule and19 full-song
checks, fallback/missing-resource, GUI/input and independent SimpleApp consumer.

## Verified baseline and evidence

- Local pinned WebFX/GWT exporter, temporary overlays for seven reviewed helpers,
  ordinary canonical Java unchanged. Sound alias cache/overlap (32 browser voices),
  independent Music pause/resume/rewind/repeat/error and owned cleanup integrated.
- Local Export → Preview → Save ZIP passed in isolated macOS VS Code. Publish app
  is in GitHub, disabled until signed in/connected. Run App is STILL native.
- Publisher checks exact repository/run/main/workflow/SHA/Pages/public marker,
  retries and saved live links. Simulation default. CURRENT workflow compiles in
  Actions; local-build deployment migration remains planned.
- ZeroHub verifies optional exact-source web receipts and offers Play latest.
  Live page is mutable; source snapshots remain exact. Legacy catalog strips web
  metadata; `/api/sharing/catalog/web` serves new kits. No compiled Hub duplicate;
  existing source ZIPs include assets. Coordinated checker/kit rollout still held.
- Root337 tests:336 pass/1 PowerShell skip; sharing48; website104 plus type/build;
  native callback/sidebar32. Four fresh GWT fixtures and48 Chrome browser checks
  include controls/drawing/audio/cache/errors/autoplay/cleanup and synthetic
  persisted-page restoration. Final independent review clean after corrections.
- Loader correction5381b4d uses30s progress windows/120s total image startup,
  clears timers on launch/error/stop, prevents late start after failure. Real35s
  and accelerated stall/total-deadline regressions passed.
- Preview VSIX250,619 bytes/70 entries/60 source files match reviewed code; SHA256
  `b8aef965202b1211d842552d264f7e918fbab86d8785e21ed357d5db07fa10bf`.
  Not installed/published. Final acceptance audit and package receipt retained.

Receipts under `.verification/integration/`: final-acceptance-audit.json,
completion-audit.json, review-ledger.json, browser-acceptance.json, package-receipt.json;
performance/ contains48-browser.log and targeted review. Loader build evidence in
`.verification/web-loading-fix/`; native flow in
`.verification/native-integration/NATIVE-EXPORT-QA.md`. Review ledger records five
conservative launches/turns, two targeted waves/two fix batches. Do not reuse this
completed baseline review as acceptance of future implementation changes.

## Media, storage and remaining limits

Game site8,208,660 bytes/ZIP7,009,261 bytes; shared compiler cache about188MB.
One ignored export/log per project, temporary builds cleaned; source-only current
publishing kit and one-day Actions artifacts. Local-bundle staging retention is a
new design decision, not yet implemented. No media caps/optimization introduced.

Single cold Mac/headless Chrome loopback samples:121ms local ready;5Mbps/150ms/
4xCPU ready8.53s, median16.6–16.7ms/p9517.5–18.2ms draw cadence over roughly5s.
Corrected loader starts1Mbps/200ms/4xCPU in40.29s (old deadline failed34.34s).
First key→HTML audio playing95/217ms is not physical sound latency. Assets4.43MB
PNG/1.58MB WAV, decoded RGBA estimate25.17MB excluding overhead; unused0.79MB
bird.png still preloads. Asset diagnostics/classroom budgets are proposed only.
No responsive-device guarantee from these samples. Actual Windows, other engines,
physical focus/BFcache navigation, speakers, novice/school networks, authentication
and hosted publication remain unverified. No push, deployment, account grant,
public activation or installed update occurred.

Orchestration: DeepSeek pilot paused; last baseline weekly86% remaining is
account-wide, not attributable task cost. No new delegation for this small
consolidation. Storage check healthy (~342GB free); retained all unique worktrees.
