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
passes after correcting test pointer baseline. Counter unchanged. WebFX9builds
and root regression underway; website165/165, typecheck/build and /docs4newanchors
pass. Existing Dev focus timeout repeated; harness focusdeadline now begins at
first visible frame rather than setup before CSS/scene creation, under validation.

Evidence logs .verification/full-game-*.log and .verification/full-game-web/.
Independent lifecycle/browser review will follow fixed candidate and cheap checks.
No central kit service, hosted deployment or automatic project upgrade added.
Use source-based Zero Dev; no installer iteration. Previous accepted UI slice at
8f3bcfe5 and receipt b1b872eb remain in docs/EVIDENCE.md.
