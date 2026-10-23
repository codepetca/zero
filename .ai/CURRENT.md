# Project-owned builds, no central kit service — 2026-10-23

Owner authorized policy revision and Astra review: projects own framework source
and native/browser build files, with no required central historical-kit storage,
database or registry. Keep maintenance simple. Documentation only; no runtime,
schema, artifact, service or publication changes. Canonical section: Project
versions and preservation in docs/FRAMEWORK-ARCHITECTURE.md, linked from model,
reliability/product/components/development/repository guidance and AGENTS.

Default: student repository retains actual Zero source/build logic/profile and
exact dependency/version records. Editor updates do not upgrade them. Normal
artifact hosts supply dependencies; no new central historical-kit resolver.
Retained playable web output is independent of rebuilding. Optional full offline
bundles belong to students; default indefinite rebuilds depend on usable tools
and artifact availability. Maintain one current line, no old branches/all-version
CI or old-API shims. Existing ZeroHub sharing/catalog/artifact rules are unchanged.

Project files/metadata are untrusted; no automatic hooks on open, execution bypass
or editor credential access. Safe project-owned browser builder/launcher and
complete records remain future work; current exporter still owns browser rules.
Reuse existing ZIP/hash manifests, record actual source snapshots and preserve
explicit branch-based upgrade/rollback. App/GameApp/simple Screen/World model,
replaceable components, Java-first/Zero API and pinned WebFX goals remain.

Next: configuration/links + focused website checks, fixed local commit and
independent requested Astra/xhigh review. One initial reviewer/wave, up to four
targeted correction waves/batches, 60min session/30min reviewer caps. New receipts:
.verification/project-owned-build-astra/. Prior policy dde2db2f is historical;
mandatory central release archives/offline restore as default are superseded.
Final results go in docs/EVIDENCE.md. No new runtime or restore proof this turn.

Preserve Actor worktree/receipts, primary funding and tutorial-padding Dev work,
profiles/scratch/watcher. No push, PR, merge, deployment, release, installation,
account change or dependency install authorized.
