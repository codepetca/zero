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

Accepted at b662eeea25cab5f580838a2839833446f5bb8c04 after independent requested
Astra/xhigh review: complete nine-file diff, one initial wave, 251.8 seconds,
no actionable findings or correction batches. Effective configuration/tokens
unavailable. Reports/receipts: .verification/project-owned-build-astra/.
Prior mandatory central archives/default offline restore are superseded.
See docs/EVIDENCE.md. Checks: npm run check, focused website tests 30 pass/0 fail,
and diff check pass. No runtime or clone/build/backup/restore proof this turn.

Next implementation acceptance: retain all required Zero-owned builder support
modules/config in the project; retain dirty-source bytes when promising exact
recovery; distinguish missing tools/artifacts, unsupported launch paths and API
errors. Safe launcher design still needs implementation/security review. No new
execution or publication authority follows from accepting the policy.

Preserve Actor worktree/receipts, primary funding and tutorial-padding Dev work,
profiles/scratch/watcher. No push, PR, merge, deployment, release, installation,
account change or dependency install authorized.
