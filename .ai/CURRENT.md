# Current state — browser publishing integration (local, unreleased)

## Agreed outcome and coordination — 2026-10-15

Human asked this chat to coordinate the WebFX work and identify one lead/goal.
Coordinator: **Explore publishing the Flappy Bird**. This chat owns integration,
writer assignments, acceptance evidence and user decisions. The existing chats
**Assess WebFX compatibility and app** and **Build Flappy Bird with Zero** supplied
read-only handoffs and confirmed no active writers/workers; their completed
results are inputs, not competing implementations. Do not create another lead chat.

Goal: students keep ordinary Java and the supported Zero teaching API, develop
with native Run App, choose Publish app, and get a verified browser-playable link
with minimal setup. GitHub Pages hosts the student's game. ZeroHub offers a Play
link to that hosted page without storing a second complete compiled game.
Playable links remain separate from repository/Pika submission links.

Current phase: reconcile the completed exporter/publisher with the latest reviewed
framework, then prove the complete student flow. Exporter feature completion below
does not mark the overall integration/release goal complete.

Complete on isolated `codex/web-export`, attached worktree `web-export/zero`,
base `8caba8b`. Reviewed code head `c5db993`; final handoff changes only docs.
Canonical framework/game source and the other chat's active checkout are untouched.
Published core/kit/native versions remain frozen. No push, deployment, release,
publication, account grant or installed Zero update occurred.

Export for web compiles a temporary adapted copy with pinned WebFX/GWT and offers
local preview/ZIP. Publish app coordinates reviewed source-only Pages setup,
normal Upload changes, exact workflow-run/public-marker verification and durable
Open/Copy playable links. Simulation remains default; ordinary Java is unchanged.
See [WEB-EXPORT](../docs/WEB-EXPORT.md).

Checks: configuration/syntax pass; focused66/66; full319tests318pass/1skip/0fail;
final readiness-boundary19/19. Real helpers/quiz/drawing compile and18browser
checks pass, including init exactly once before setup. Frozen JavaFX-audio Sky Hop
rebuilt and passed browser input/audio smoke. Final VSIX68files/234145bytes;
all58packaged source files match reviewed code. Site8.2MB/ZIP7.0MB; temp build
removed and per-project log retained. Detailed receipts and review in EVIDENCE.

Independent review complete: two Sol/high initial reviewers, two targeted turns,
seven reported issues accepted/fixed across two batches, no remaining findings.
Initial coverage plus reviewed deltas covers corrected code; no additional full
review wave adds coverage. Native editor UI/auth, real Pages publication, Windows,
physical focus/speakers and non-Chrome browsers remain unverified.

## Single integration sequence

1. Integrate reviewed framework `codex/student-game-helpers` at
   `dbaef8c0ea44aebcb137ddb7351f030ed8dd0b17`, direct child of exporter base `8caba8b`.
   Its worktree is clean: `/Users/stew/.codex/worktrees/student-game-helpers/zero`.
   Preserve the seven-class,98-declaration ordinary Java API and native behavior.
   Existing framework/browser assessments before these commits are historical.
2. Extend generated SimpleApp/resource/Sound/Music adapters and release checks.
   Preserve canonical resource aliases/cache identity, overlapping effects,
   volume/mute/status, music readiness/end/error callbacks, pause/resume/rewind,
   repeat mode and app-owned cleanup. Do not weaken native API to fit WebFX.
3. Freeze a verification copy of latest `/Users/stew/Repos/zero-flappy-bird` after
   checking its supplied source ZIP SHA256
   `66b20743c2ba310f572197714a7e01ff1a430e682989894285d367c63eed47f8`.
   It is not a Git repo; framework copies match `dbaef8c`. Preserve game/art/design,
   ordinary explicit rules,480x680 canvas, audio and Space/click/P/R/M behavior.
   Reuse native receipts and extend real browser tests to this current version.
4. Expand compatibility gates over supported Zero API and maintained examples,
   including controls mixed with canvas, resource aliases and audio lifecycle.
   Advertise tested coverage and useful errors; no promise of arbitrary Java or
   desktop-only library compatibility. Fail CI on unreviewed profile/API drift.
5. Complete native Publish app→Open/Copy UX verification and the ZeroHub Play URL
   contract/UI. Keep source-only Git setup, stable URLs, bounded artifacts,
   simulation, existing-site protection and exact deployment verification.
6. Independently review integrated code; finish desktop/browser regression and
   target-platform checks. A real native-auth/Pages/ZeroHub round trip and release
   require explicit user authorization for the chosen destination/account; prepare
   a concrete reviewable build first. Record actual public URL/version only after
   deployment verification. Current authority does not grant push/deploy/release.

Compatibility chat owns no code now; its historical notes are in the dirty root
checkout `docs/WEB-PUBLISHING.md` plus `.verification/webfx-2026-10-15/`. Import only
useful evidence selectively and preserve unrelated funding edits. Framework/game
chat supplied native audio57assertions, game194/audio19, root263pass/1skip and
website98pass/type/build receipts. Its reviewed source manifest and detailed API/
art contracts remain in its worktree `.verification/audio-helpers/`. Other chats
should receive bounded assignments only when useful; one writer per component.
Keep this worktree for integration. Prior deliveries remain in EVIDENCE/VERIFICATION.
