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

## Active goal: guided student setup

Owner asks better setup guidance, checking installed tools and installation help,
for personal as well as school laptops. Implement locally: Windows/macOS launchers,
Linux guidance, a minimal native Setup Help checklist and repair actions, and kit
packaging. New local kit/extension0.5.4 is unpublished; core0.1.1 unchanged.
No push, PR, merge, release, deploy, actual host installations or credentials changes
are authorized for this feature. Student repair actions explicitly prompt/choose;
no silent privileged installs or bypass of school policy. Preserve existing tools.
GitHub sign-in/sharing is optional for local running; upload simulation stays default.

## Execution and ownership

Managed checkout: /Users/stew/.codex/worktrees/kit-integration/zero,
branch codex/guided-setup, base1f2fd53c. Primary Zero contains unrelated funding
work; do not reset, stash, overwrite or integrate it.
Coordinator owns packaging, release metadata, root docs, integration and checks.
guided_setup_launcher: GPT-6.1-Sol/high, owns setup/ only.
guided_setup_editor: GPT-6.1-Sol/medium, owns extension setup module, setup command
integration and new setup tests only. One writer per component, no recursive delegation.
Effective models/tokens unknown. Weekly22% remaining at start is account-wide;
DeepSeek remains paused through2026-12-31. Do not create extra tasks/goals/automations.

## Acceptance and current phase

Implementation underway. Existing instructions/check outputs are not evidence
that a physical clean machine installed tools. Require read-only checks with
accurate JDK/compiler/version/project/profile readiness, explicit installs/repair,
quoted paths, cancellation, optional Git, no user-settings/credential mutation,
focused tests and extracted ZIP source/permissions/Maven compile verification.
Review runtime/installer authority and packaging/platform compatibility independently
before delivery. Never run installation tests against real host tools/accounts.

Physical Windows/Linux classroom/personal setup, actual installers/permissions,
network policy and novice usability remain unverified. Run-first-app stays explicit;
version checks alone do not prove a native window works. Next: accept both worker
outputs, verify and review, regenerate local ZIP, report limits. Publication is a
separate user decision.
