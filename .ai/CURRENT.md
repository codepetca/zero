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

Next: configuration/link and focused website checks, fixed local commit, then
independent requested Astra/xhigh review. Budget one initial reviewer/wave, up to
four targeted fix waves/batches, 60min session/30min reviewer ceilings. New review
receipts: .verification/version-policy-astra/. Earlier accepted simple model at
797541f6 remains baseline. Final coverage/results go in docs/EVIDENCE.md.

Retain Actor worktree and earlier receipts. Preserve primary funding and
tutorial-padding Dev work/profiles/scratch/watcher. No push, PR, merge,
deployment, release, account change or dependency installation authorized.
