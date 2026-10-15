# Current state — browser-first implementation, live publishing held

## Goal and authority

One coordinator: **Lead publishing task**, thread
`01a13f98-55fc-7471-9038-1198b14d5a98`. Students write ordinary Java/approved
JavaFX locally; Run App checks/compiles locally and previews in a browser;
Publish app in GitHub deploys the same validated app to student Pages. ZeroHub
links to that app without a second compiled copy. Explicit object updates,
simple controls, useful errors and bounded storage remain requirements.
Cloud development/hosted compilation/playgrounds are out of scope.

Owner2026-10-15 explicitly authorized implementation with subagents here and
integration/testing before any live publication. No account grants, push,
external publication/deployment, production policy activation or release.
Preserve ZeroHub library-checker acceptance hold. Existing tool-backed goal was
blocked on live authority; it is not complete. New local work is authorized now.

## Working state and ownership

Only `/Users/stew/.codex/worktrees/web-export/zero`, branch `codex/web-export`.
Base `cdf30b3`; reviewed previous runtime `5381b4d`. Root funding checkout,
original game and installed Zero unchanged. No worker stages/commits.

- Coordinator owns snapshot.js + tests, docs, integration and acceptance.
- strict_webfx: compatibility/**, engine index.js integration and strict tests;
  semantic javac member resolution before adapters, exact helper fingerprints.
- browser_run: extension.js, managed preview/run lifecycle, export UI,
  command configuration and associated tests; supported VS Code APIs.
- local_publish: publisher/UI/deployment runner/bundle and necessary receipt
  consumer changes/tests. Local bundle upload transport, no hosted compile.

All three requested GPT6.1Sol/high, focused fresh briefs; effective configuration/
tokens unknown. No recursive delegation. Agree snapshot interfaces; one writer
per component. Latest weekly83% remaining is account-wide; storage~342GB free.
DeepSeek automatic delegation paused through2026-12-31.

## Plan and next acceptance

See docs/WEB-EXPORT.md Planned browser-first migration for shared contract,
preview Stop/restart/cancel, resolved approved constructors/methods/fields and
local-output publishing requirements. Snapshot API: ensureValidatedExport(options),
validateExport({projectRoot,result}), captureBuildInputs and buildProfileHash.
Inputs include Java/resources/pom/Maven wrapper/config; verify output+ZIP hashes.

Current wave implements three components in parallel. Then integrate, run root/
sharing/website gates, real GWT fixtures/SkyHop and actual managed-preview editor
lifecycle checks; independent security/correctness + compatibility review at a
fixed final revision. Reviewer budget starts at initial review, not implementation.
Do not claim strict compatibility or real runtime Stop from mock tests alone.
No live account or hosted trial in this authorization.

## Retained baseline and handoffs

[Archived baseline](archive/web-export-baseline-2026-10-15.md) retains source-chat
IDs, commits, game design constraints and verification paths. All three source
chats archived successfully; histories/files/worktrees kept. Baseline optional
export works with seven helpers/98declarations,48Chrome checks and337root tests
(336pass/1platformskip),sharing48,website104/native32; reviewed/unreleased.
New browser-first/resolved-gate/deploy-only changes have not yet passed acceptance.
Frozen game `.verification/integration/latest-sky-hop`; original
`/Users/stew/Repos/zero-flappy-bird` and its ZIP preserved. Existing receipts in
`.verification/integration/` and `.verification/native-integration/`. Historical
performance samples and media caveats remain in WEB-EXPORT and archived record;
no new asset caps or transformations authorized.
