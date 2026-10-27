# Faster unchanged publication checks — 2026-10-27

Owner authorized local implementation, timing and changed-project verification;
remove the duplicate Open published app link. Publishing/releases remain separate:
no push, hosted app publication, source PR/merge or installer/feed changes here.
Base cbcbb51eb316d1ed5a7663086c37acdae8e682af, branch
codex/published-app-fast-check in tutorial-docs-label/zero. One coordinator writer.

Current source adds read-only verifyUnchanged before full review: exact clean main
commit plus browser-input proof; one fresh account/repository/installation access
check per command; concurrent Pages/run reads; public marker and final remote main;
final local input/project/session/mode/cancellation checks before browser dispatch.
No persistent permission cache, compiler or saved project execution. Mutations
retain existing guards. Pending/staging recovery runs first. Historical palette
commands remain; the sidebar link and its unused CSS are removed.
Fix host snapshot commit proof without a retained build result; compare exact
inputs to Git and recheck, retaining strict build-result validation when supplied.

Controlled real local Git/mocked HTTP timing (25ms/App-access check, stubbed input
proof): medians2196ms→252ms, 88.5%less; access checks7→1, Git198→22,
publisher/public HTTP7→4. This is orchestration evidence, not live-network timing.
New fast-path/drift tests and integrated real Git/real input proof with simulated
build/GitHub pass. UI/snapshot99 and sidebar/design52 pass. Config check passes.
Local source-backed dark preview confirms no duplicate link and Run menu item.
Evidence/logs: .verification/publish-fast/. Full regressions and independent
review next. No releases or published student apps touched; installedMac54 intact.
Task-scoped prior budget/low-usage waiver persists; no account changes/reset.
DeepSeek pilot remains paused. Preserve sealed Mac54 candidates and primary work.
