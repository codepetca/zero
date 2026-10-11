# Current state

Updated 2026-10-10. Read docs/PRODUCT.md and docs/DEVELOPMENT.md before edits.
Historical handoffs in docs/history/ are evidence, not active work orders.

## Product and published delivery

Zero is the local VS Code extension/profile and ordinary Java/JavaFX teaching kit.
Preserve explicit object updates, the minimal sidebar, and student-owned GitHub
repositories with separate Pika link submission. No Code OSS fork.
Zero0.5.3 and Community0.1.3 are published at https://zero.codepet.ca/.
Lessons0–12 ship. See docs/EVIDENCE.md and docs/VERIFICATION.md for source/review
records and actual platform limits. Community components remain experimental;
AI/CI do not accept, recommend, publish or appoint maintainers.

AI hardening merged: Zero PR20 at1f2fd53c70008b3905062bdc39e056612e21271b,
Community PR5 at31febf2f22228553e40e96abe92bcbbf83032815.
Owner explicitly requested removing both GitHub main protections; readback after
merge confirmed404 unprotected and empty rulesets. Do not restore protections
without new authorization. Community acceptance-helper review checks remain.
No live AI provider. Old release/merge grants completed; no standing publication grant.

## Completed local delivery: guided student setup

Owner asks better setup guidance, checking installed tools and installation help,
for personal as well as school laptops. Implement locally: Windows/macOS launchers,
Linux guidance, a minimal native Setup Help checklist and repair actions, and kit
packaging. New local kit/extension0.5.4 is unpublished; core0.1.1 unchanged.
No push, PR, merge, release, deploy, actual host installations or credentials changes
are authorized for this feature. Student repair actions explicitly prompt/choose;
no silent privileged installs or bypass of school policy. Preserve existing tools.
GitHub sign-in/sharing is optional for local running; upload simulation stays default.

## Local source and verification

Managed checkout: /Users/stew/.codex/worktrees/kit-integration/zero,
branch codex/guided-setup, basecbd12ad1b67252f6c4c33fbbe22aa40052eb0791.
Implementation8032789; runtime correction61025bf09b633921a09e32b099754633dde4855e.
Lesson12 PR21 merged before this branch; its game stages are preserved in the
new local kit and are outside the setup feature delta. Primary Zero contains
unrelated funding work; do not reset, stash, overwrite or integrate it.

178 full-suite tests passed before the guard correction; 46 affected tests passed
on the corrected runtime. Launcher12, release43 and kit3 checks passed.
Configuration/links and regenerated ZIP source/permissions/extracted Maven build
passed. Two initial independent GPT-6.1-Sol/high reviews plus one targeted pass
accepted the runtime; both P2 findings resolved. No extra integration wave:
unchanged source retained its initial coverage; targeted pass covered both guards
and the Run recheck boundary. Final nonfunctional README wording/receipts are
coordinator-checked. See docs/EVIDENCE.md and docs/VERIFICATION.md.

Coordinator accepted launchers (GPT-6.1-Sol/high) and editor checks
(GPT-6.1-Sol/medium). One writer per component. Effective models/tokens unknown;
weekly22% remaining at start is account-wide, not task cost. DeepSeek remains
paused through2026-12-31. No extra tasks/goals/automations were created.

## Next decision and limits

Local kit: dist/zero-bootstrap.zip. It is not the published website download.
Guided setup detects/reuses tools and offers explicit installation/help; GitHub
remains separate. Relevant terminal overrides make Run readiness unverified;
settings are preserved. A successful check alone does not prove a native window.
Physical Windows/Linux classroom/personal setup, actual installers/permissions,
network policy, native picker interaction and novice usability remain unverified.
Next: owner may try the local kit and authorize source PR/merge or publication
separately. Do not infer either authorization from completed older work.
