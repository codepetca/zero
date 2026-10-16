# Current state — PR 78 integration, 2026-10-16

Coordinator for release: Lead publishing task, 01a13f98-55fc-7471-9038-1198b14d5a98.
PR/merge writer: Review verbose action confirmations, 01a144e4-4bab-7be1-8d7b-cda1d7a45f1e.
Canonical worktree /Users/stew/.codex/worktrees/release-readiness/zero,
branch codex/release-readiness. Owner explicitly authorized PR and source merge.
Reuse [PR 78](https://github.com/codepetca/zero/pull/78); no duplicate source writer.

Integrating Windows main 1ad89e6 with reviewed browser-publishing head d718d7e.
Four conflicts: CURRENT, DEVELOPMENT, EVIDENCE, kit core version. Preserve both
source/evidence histories, kit/extension 0.5.18, core 0.2.1, native 18, Windows local
0.5.18 and disabled updater. Automatic source merges require exact comparison and
one bounded final integration review before push/CI/merge. No new legacy review
loop: prior ledger 6 launches, 1 initial/5 targeted, 5 approved fix batches. Final
integration wave remains; stop for a concrete checkpoint if new fixes need review.

Current accepted Mac preview source 4a9e889, runtime ce12fa7; kit and VSIX candidate
dist/candidates/zero-0.5.18-guides-4a9e889; unsigned universal artifact
 dist/installers/candidate-4a9e889. All 106 installed authored files match that
candidate. Native Project menu, Clone/Open/Connect, remembered clone parent across
cancellation/reload and actual Chrome Run/wrong/right/Stop passed. Study Main and
Tutorial 3 restored. No fresh clone transport/OAuth/Sync claim. New integrated
extension/package requires proportionate preview update; release coordinator owns
installed profile and native UI after reviewed source handoff.

Prior browser root 510 pass/1 PowerShell skip; clone preference 34 focused pass;
website 109 pass/types/build; check/package/extracted-kit and corrected guides pass.
Windows main was independently reviewed and passed hosted Server 2022/PowerShell
5.1 native/setup/update, real private runtime install/reopen and JavaFX offline
rebuild in [CI 38935344735](https://github.com/codepetca/zero/actions/runs/38935344735).
This is not interactive Windows 11/SmartScreen or signed A-to-B proof. Prior Mac
focus-dependent framework harness lacks a passing verdict; real integrated CI
must pass it without weakening assertions. Root/website and affected integration
checks and exact PR-head GitHub CI remain to run before source merge.

Source PR/merge authority does not publish public templates/publisher policy,
activate trusted operator pins, sign/notarize/seal distribution, promote release
assets/update feeds or perform live student Git/Pages/ZeroHub actions. Published
0.5.17 assets/feed unchanged. Five corrected complete templates need separate
publication authority. Real trusted Play/public bytes and school/novice acceptance
remain external release gates. Physical Windows user trial remains separate.

Evidence: docs/EVIDENCE.md, docs/VERIFICATION.md, docs/RELEASE-0.5.18.md and
.verification/release-readiness-20261016/pr78-integration/. Existing Mac/Windows
candidates and ignored receipts preserved. Original funding checkout untouched.
DeepSeek remains paused through 2026-12-31. Starting weekly remaining 45% and
healthy cached storage 316.6 GB are shared observations, not task cost.
