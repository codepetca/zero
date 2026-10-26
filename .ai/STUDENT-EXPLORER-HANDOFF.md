# Student explorer task handoff — 2026-10-26

Owner requested a separate task after approving the full plan and initial work.
The original chat stops explorer implementation at this snapshot. All three bounded
workers have returned and stopped. No native tree, manifest, integration or new
Mac/WebFX acceptance has been implemented yet. No independent review of this slice
has occurred. Do not describe it as ready/released.

## Start safely

Before substantive work, create/confirm this new task's tool-backed goal. The old
architecture chat retains its unfinished goal; do not modify that goal. Follow
`docs/STUDENT-EXPLORER-PLAN.md` as the single plan.

Use a new managed worktree from the exact handoff commit supplied in the initial
prompt. The saved project directory `/Users/stew/Repos/zero` has unrelated dirty
funding work on codex/education-funding: never edit, reset, stash, switch or clean it.
Do not run two coordinators in the original actor checkout. All changes in this
snapshot are committed locally for transfer; no source push or PR exists.

## Delivered initial backend slices

- file-actions.js + new file-targets.js: optional context for class/file/folder;
  new zero.newPackage; selected package declarations; ordinary defaults preserved.
  Context `{root,area,relative,libraryFolder?}` uses project-relative directory.
  Areas code/assets/library-code/library-assets/project. Resolver accepts kind
  class/package/file/folder/asset/assets. Library namespace derives from
  discoverLibraries.identity.namespace; only local mode writable. It rechecks
  trust/current root, ordinary ancestors, stale descendants and boundary/collision
  guards. No active-editor inference or general move/rename refactor.
- assets.js: zero.importAssets(context?) and importFiles({destination:context})
  target selected app folder or local namespaced component resources. Existing
  calls preserve app resource default. Classpath strings exclude source prefixes.
  Existing keep-both/skip/cancel/partial ownership guards retained.
- project-explorer-model.js: readProjectModel, ordinaryEntries, isToolingPath,
  libraryDetails, LIMITS. Model contains root/title/codeRoot/assetsRoot/corePaths/
  libraries/otherEntries/excludePaths. Library entries contain exact mode/version,
  identity namespace and authored source/resources/checks/examples/README roots,
  localVersion/localSourceActive/localImports. Published imports are empty when
  metadata is not retained. Traversal is bounded, rejects symlinks, and does not
  execute tools or fetch. Exact core filtering preserves student zero.contrib.

Worker checks: file-actions+authoring23passed; assets24passed; model+authoring+
web-export-libraries23passed. Coordinator combined file-actions/assets/model47passed
in .verification/student-explorer/handoff-tests.log (ignored, old checkout only).
Diff checks pass. No code review or native acceptance yet; root suite not rerun.

## Remaining implementation

1. Native supported TreeDataProvider/controller: Code/Assets, conditional Libraries,
   other authored project files, no generated/build/core clutter. Read model carefully:
   current tooling filter appears to omit `.zero-build` and `.zero-web`; assess and
   fix in owning task before UI acceptance. Path-only data is not authoring authority.
2. Wire file/package/asset commands, context menus, package targets, resource paths,
   previews, external-edit refresh, project switching, disposal and busy states.
   Parent libraries Code/Assets roots must target namespace subdirectory; classpath
   resource root differs. Use existing authoring and current-project guards.
3. Manifest contributions and existing control integration. Local switchable native
   Preview Student Explorer first; native full Explorer remains an escape. Status
   Zero returns to active project controls. Do not use private host layout APIs.
   Reuse native themes/controls, avoid new HTML file tree. Existing controls can be
   reused in a native view container, but multiple webviews need independent render
   bookkeeping; current extension.js assumes one view/renderedWebview.
4. Published library imports/examples need explicit authoritative exact-release
   lookup: existing consumer.loadCatalog and release.components (className,usage,
   api) are validated sources. Never fetch just to expand tree or fabricate imports.
   Local library imports derive from actual public source. Reuse existing Develop
   local/Use published, Check, Share, Add/Update/Revert actions, namespace/pin guards,
   not parallel publication/dependency logic. Installed editable-copy/fork is deferred.
5. Isolated disposable projects: beginner App, packaged Game+assets, local component;
   native Mac typing/clicking with CUA only; scoped native and actual WebFX/browser
   compile/play proof and regression checks. Update public command docs/tutorials
   truthfully; framework Java API itself need not change. Existing templates and
   publication hashes must not be silently replaced or republished.
6. Independent risk-matched source review, proportionate tests, source/doc handoff.
   AGENTS requires owner review of shared light/dark proposals before replacing
   default visual design. Complete working local preview and backend acceptance
   first, then show concrete host screenshots for that final decision. No source
   push/PR/merge, PR integration, deployment, hosted sharing activation or release.

## Preserve other state

Original my-greeting: clean main2909872c993b311e74cd1b3331f46a5baea57a42.
Existing live disposable pilot: clean mainba318d05203466744f0366a37bb7bc89735a975a.
Do not move their files; use new disposable projects/profiles for tests. Original
Zero Dev source/profile and historical ignored fixtures remain in actor checkout.
The private QA wrapper uses fixture-only provider/exact bare mapping; do not enable
it against real projects or copy credentials/profile storage. Native Git auth OFF.
Current connection is NOT school network. Fresh Mac/Windows/min host separate.
Public Mac50/core0.3.0/manualkit17/Windows21 and ZeroJams hold unchanged. DeepSeek
pilot is paused through2026-12-31; check current skill/record if policy changes.
No new library hosting, telemetry or framework upgrade is authorized.


## Continuation checkpoint — 2026-10-26

The isolated `student-explorer/zero` owner implemented and reviewed the remaining
native preview through c8ce5cb2. The canonical plan now records pending owner visual
review; detailed accepted tests and limits are in docs/EVIDENCE.md. Do not restart
from the historical Remaining implementation list above. Code/Assets, Libraries,
selected commands, reference metadata and existing guarded actions are integrated.
Native Mac, scoped native/WebFX/browser and independent source checks pass within
the recorded limits. Concrete native light/dark screenshots and the live isolated
preview are ready. Standard Explorer remains default until owner acceptance.
Source publication/release/account/ZeroJams holds are unchanged.
