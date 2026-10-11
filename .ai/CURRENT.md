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

## Local delivery and active native setup packaging

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
Owner agreed to strengthen checks before native installer wrapping. Follow-up
base080d7a4, implementatione2fad4b, corrected runtimea6078beb91bf8210e8c9ded4ac5467363eaefe64
is locally accepted: compatible VS Code engine/candidates, selected paths,
explicit managed install versus upgrade, conservative configuration guidance.
Minimum VS Code is generated from extension engines. 34 launcher tests,4kit tests,
configuration/links, corrected ZIP byte/permission/source checks and standalone
Maven compile pass. Two complete initial independent GPT-6.1-Sol/high scopes plus
one targeted pass resolved one aggregated Homebrew inventory P2. Unchanged editor
and prior compatibility coverage reused; no extra integration wave.
setup_compatibility GPT-6.1-Sol/high accepted; no active writers. Weekly21%
remaining at start is account-wide; effective models/tokens unknown. Native
Windows/PowerShell, actual managed installs, profile interaction and novice use
remain unverified. No host installations or publication occurred.

Active owner request: implement thin native wrappers per docs/INSTALLER.md,
base d0311ea1827769110adbe86b5a66db83b85ed113, local only. macOS AppKit app
in a universal DMG; Windows Forms AnyCPU EXE on .NET Framework 4.8. Both embed
the measured complete kit, check existing tools without installation, require a
fresh writable project folder, and explicitly continue into the accepted setup
scripts. No silent policy bypass, existing-project overwrite or account changes.
Writers: installer_macos owns native-installer/macos; installer_windows owns
native-installer/windows, both GPT-6.1-Sol/high. Coordinator owns build tooling,
docs, artifact integration and acceptance. Weekly20% remaining at phase start;
account-wide, effective models/tokens unknown. DeepSeek still paused.
Delivery gates: bounded fake/native backend checks, universal app/DMG and PE
payload parity, independent risk-matched review, local development artifacts.
Windows native UI/PowerShell and actual tool installation remain unverified.
Packages are being built, not yet accepted. Source PR/merge, signing-account
access and publication remain separate owner decisions. Do not infer authorization
from completed older work. Local ZIP remains dist/zero-bootstrap.zip.
