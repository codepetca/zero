# COIN QUEST and navigation — 2026-10-23

Owner asked to turn the coin prototype into a fuller game with title screens.
Worktree /Users/stew/.codex/worktrees/actor/zero, base b1b872eb. Local source work;
no push/PR/merge/install/release/deployment/account changes. Preserve unrelated
primary funding and tutorial-padding Dev scratch/profile/watcher state.

Game now has title/help, two levels of three coins,30 active seconds per level,
manual pause/resume, victory/timeout results and replay/restart/title paths.
Main owns Phase/state/rules; ordinary TitleScreen/HelpScreen/PauseScreen/
ResultsScreen classes return Element views, Hud reuses unchanged ScoreDisplay.
All student imports use Zero; no zero.Screen base, World or second game loop.

Framework adds GameApp.showGame/pause/resume/isPaused (13helpers/146decl).
App.show(Node/Element) is one navigation path: suspend update/draw/input off-game;
showGame restores retained canvas/HUD with cleared input/zero first delta and
respects explicit pause. pause skipsupdate but draws/UIcontinue. Frame navigation
last-wins after successful draw; failure/stop discards pending. Package-private
frame brackets/hooks keep public surface small. Native/browser sizing measures
retained game+HUD before restoring title; exact browser overlays/gates updated.
Screen lifecycle, replaceable World/animation, project-owned browser tooling and
new diagnostics/telemetry/distribution remain proposed. Preservation policy stays
project-owned source/build files, exact pins and no required central old-kit DB.

Workers: Sol/high runtime+NavigationCheck, Sol/medium browser/contracts, Sol/medium
API/docs+immutable historical App testfixture. Runtime/guide source frozen.
Native framework/navigation checks pass; native full-game603-frame playthrough
passes after correcting test pointer baseline. Counter unchanged. WebFX/browser and root regression pass; website165/165,
typecheck/build and four new /docs anchors pass. Existing Dev focus timeout
repeated; its deadline now begins at the first visible frame rather than setup
before CSS/scene creation. Foreground failure remains unresolved locally.

Accepted source: ef21cdbf90b5ff5adc1c84dc0916dcdf1843d119 plus correction
d62aea08ea2bde1a8c0143abc4ec67a0e586ce65. Initial complete36-file review:
Astra/xhigh lifecycle, Sol/high browser/source preservation. One blocking P2
(reentrant centre listeners left stale gameVisible) fixed by reconciling final
root.getCenter. Native regression fails oldbody and passes fixed full framework,
including both redirect directions. Targeted Astra review accepted four-file
correction with no new findings; unchanged initial coverage reused.

Full root1004pass/0fail/3skip; website165/165 +types/build/docsanchors;9 initial
pinnedWebFX builds +Chrome85/mobile136; corrected navigation+game builds2/2 and
focused Chrome24/24; corrected adapter/migration43/43 andcheck/diff pass.
Prior7 browser fixtures/mobile/real30second loss evidence reused explicitly for
private-hook correction. KnownDev keyboard macOSforegroundassertion stillfails;
allnativeframework/navigation +nativegame603frames pass separately. No claim that
Devsmoke/physicalkeyboard/otherOS/physicaldevices/measurementfaultinjection passed.

Review ledger .verification/full-game-review/ledger.json; proofs in docs/EVIDENCE.md,
.verification/full-game-*.log and full-game-{web,fix}/. One initial2-reviewerwave,
one targetedwave/one fixbatch;3turns, no extra integrationwave becausecorrected
interaction+unchangedcodecoveragecomplete. Effectiveconfig/token telemetry unknown.
Only evidence/handoff text follows reviewed code. User's IAB gamepreview nowshows
corrected COINQUESTtitle; localpreviewserver remainsrunning. No externalpublishing.
PreviousUI slice8f3bcfe5/receiptb1b872eb retained in history. Use ZeroDev sourceflow.
