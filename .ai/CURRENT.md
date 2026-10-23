# First Zero UI slice — 2026-10-23

Owner authorized a quick working framework increment with real app/game examples.
Worktree: `/Users/stew/.codex/worktrees/actor/zero`; base
`5c6ddc62334e92290c8845e27c8f26d26002a394`. Preserve primary funding and other
Zero Dev scratch/profile/watcher work. Local implementation only; no push, PR,
merge, installation, publication, release, deployment or account changes.

Implemented, unreleased: zero.ui.Element/Label/Button/Column, zero.Color,
App.show(Element), GameApp.controls(Element) and Color drawing overloads.
GameApp extends App and retains one existing frame driver. show(Element) keeps
show(Node) replacement semantics and does not suspend gameplay. controls mounts
a live bottom HUD. JavaFX bridge is protected Element(Node)/final fxNode().
Atomic Column validation preserves child ownership on failure; button callbacks
replace previous callbacks. Exact browser source identities and member gates
include all 13 helpers/142 public or protected declarations, not arbitrary zero
package code. Readable generated starter/lesson/example copies include UI packages
with ownership and symlink guards. API/guide/website metadata change together.

Counter App and pointer coin GameApp use Zero imports and the same unchanged
ordinary ScoreDisplay source. Assembly/native acceptance commands are documented
in framework/prototypes/README.md. These are first composition examples; no claim
that animation/container replacements or managed ZeroHub distribution were added.
Screen/navigation/pause, World, input/image facades, project-owned browser tooling,
new automatic diagnostics and opt-in telemetry remain planned. Existing project-
owned source/build/version preservation policy remains canonical in
docs/FRAMEWORK-ARCHITECTURE.md; no central historical-kit service/database.

Workers: native core + prototype acceptance (Sol/high), WebFX/contracts/browser
(Sol/medium), docs/API + source assembly (Sol/medium). DeepSeek pilot paused.
Checks/review receipts and remaining limits will be recorded in docs/EVIDENCE.md.
Use source-based Zero Dev and native/browser checks, not installers, to iterate.
