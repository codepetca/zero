# Simplify desktop GitHub sign-in — local source change

Use `/Users/stew/.codex/worktrees/actor/zero`, branch `codex/simplify-github-sign-in`,
base77b371db (published49metadataPR195). Owner asked to remove code sign-in and
make the main tutorial control say Sign in to GitHub while signed out.
This authorizes local implementation/testing, not another push/PR/release.
Published Mac0.5.49, production website/feed and sealed artifacts stay unchanged.

New connections use browser authorization only. Code command/button/fallback
removed; old saved device-issued sessions retain their original renewal path.
Signed-out main button signs in only; authenticated state says Start tutorial,
disabled until repository access is ready. Tutorials/Open stay available offline.
No change to broker, PKCE/callback validation, identity/permissions, secret schema,
Java framework, project files or versions. Parent owns UI/docs/commands/integration;
Sol/high browser_only_login worker owns provider/browser/client tests (delivered).

Root checks and69UI/onboarding/command/playground tests pass; worker's128GitHub
App tests pass (final owned subset40pass). Actual production-renderer browser
fixture verified light/dark/highcontrast signed-out, install-disabled and ready
states, sign-in dispatch and Tutorials keyboard menu. Native Dev launch ran, but
computer controls selected installed Zero instead of the separate Dev instance;
no native-editor/realliveOAuth acceptance claimed. Installed account state and
unsaved work preserved. Browser preview is simulated; no new GitHub login or
repository operation was performed. Independent source-review receipts and final
verdicts: `.verification/simplify-sign-in/`. Two independent Sol/high implementation
reviews at0a525808 are clean; one P3 docs inconsistency was corrected separately,
with targeted closure in the receipts. Root Dev watcher/preview at3153 retained.

Remaining before shipping: actual new native/editor interaction, source PR/CI and
separately authorized new immutable release; do not modify published49bytes.
Existing fresh-Mac/school-network/novice/actualSparkle pilot gaps remain open.
Primary checkout's funding work and private student editor remain untouched.
DeepSeek paused through2026-12-31. No new goal/task/automation.
