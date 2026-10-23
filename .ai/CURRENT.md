# Project versioning and preservation — 2026-10-23

Owner authorized architecture-policy revision and Astra review: pin exact Zero
framework/build-kit releases, preserve source and finished output, make upgrades
optional/reversible, and keep maintenance simple without supporting every old
version. Documentation only; no runtime, schema, artifact or publication changes.
Canonical policy is the Project versions and preservation section in
docs/FRAMEWORK-ARCHITECTURE.md, linked from model/reliability/product/components/
repository/development guidance and AGENTS.

Target: editor updates do not rewrite projects or apply the latest browser
profile to old source. One immutable release build kit includes exporter/profile,
locks/instructions and required redistributable inputs; project backups retain
pinned libraries/assets and playable static output. Actively maintain the current
line, archive old ones without backport branches/all-version CI. Stable major
compatibility and experimental 0.x rules are explicit. Upgrade uses a branch,
preview/checks and rollback; preservation does not guarantee all future platforms.

Existing source bundles/JavaFX/Maven pins are baseline. Current templateVersion
is not a full runtime lock; installed exporter supplies browser rules/hashes.
Project-bound selection, complete restore archives, upgrade UI and preserved ZIP
provenance remain future acceptance work. No new publication/collection authority.
Simple model remains GameApp extends App, optional UI Screen/World, one Main
update/draw, replaceable components and ZeroHub-to-core contribution path.

Accepted policy at dde2db2f156752ed1a6c5ee0d97e95372cbff39a after independent
requested Astra/xhigh review: complete nine-file diff, 293.4 seconds, no actionable
findings or correction batches. Effective configuration/tokens unavailable.
Reports/receipts: .verification/version-policy-astra/. Earlier accepted simple
model at 797541f6 remains baseline. See docs/EVIDENCE.md.

Checks: configuration/syntax/contracts/local links pass; focused website
navigation/API/learning tests 30 pass, 0 fail; diff check passes. No new runtime
build or archive/restore/upgrade proof. Next implementation acceptance must use
empty caches with upstream artifact access disabled, retain actual source bytes
for dirty exports, and bind framework/build-kit identity unambiguously. Reuse
the existing web-export.zip and source/profile hash manifest rather than inventing
another format. All planned runtime/archive/upgrade capabilities remain undelivered.

Retain Actor worktree and earlier receipts. Preserve primary funding and
tutorial-padding Dev work/profiles/scratch/watcher. No push, PR, merge,
deployment, release, account change or dependency installation authorized.
