# Faster Zero development flow

Status: prepared follow-up,2026-10-22. Zero Dev is available on main through
[PR173](https://github.com/codepetca/zero/pull/173), merge0d31bcfc. The owner asked
to remember the faster loop and prepare the next work. CI selection/caching below
is planned; no workflow or existing merge gate changes are made by this document.

## Use now

Follow the default loop in [Development](DEVELOPMENT.md#default-iteration-loop)
and the [Zero Dev guide](ZERO-DEV.md). Iterate locally, run focused checks, then
finish review/docs before the final PR push when practical. Stop the sample before
native focus smoke. Preserve scratch game edits before retiring its worktree.
Installer setup/update acceptance remains separate from source-loop acceptance.

## Next implementation: scope PR CI

The current `release-review.yml` runs broad source/native/website checks,
`windows-native.yml` builds and installs an actual development installer for
`scripts/**` and other broad paths, and `web-export.yml` installs a browser and
runs real WebFX builds for every PR. These workflows explain why a tooling PR can
wait on packaging or browser provisioning after local tests pass. In PR173,
browser installation alone took382seconds; this is one observation, not a benchmark.

Implement this as one bounded CI/workflow change with its own checks and review:

1. Inventory each existing job's inputs, shared generators and transitive
   dependencies before narrowing triggers. Add an always-running classifier/check
   with a stable result; run the full affected matrix for unknown inputs,
   classification failures or shared changes whose impact is uncertain. Keep
   release/provenance and auth/publish coverage wherever those boundaries change.
2. Separate fast source checks from expensive platform/export jobs. Use the
   proposed matrix below; exact path rules must follow the dependency inventory.
   Preserve full release-candidate validation and a manual full-suite path.
3. Add PR-specific workflow concurrency with cancellation of superseded runs.
   Keep different PRs and explicit release/preparation runs independent.
4. Measure browser provisioning, Maven downloads, compilation and job queue time.
   Reuse compatible browser/toolchain caches or runner-provided browsers where
   verified; key caches to pinned versions/OS and retain a cold-install fallback.
5. Update the workflow guidance with the actual implemented commands/triggers.
   Record before/after timings separately for cold and warm runs; do not promise
   a speedup from a cached local preparation measurement alone.

| Affected behavior | Proposed PR verification |
| --- | --- |
| Documentation/guidance only | Applicable documentation/configuration/link checks |
| Dev tooling | Dev tests, configuration, preparation/isolation contracts; native smoke when game harness or native checks change |
| Extension UI/shared design | Affected extension/UI tests and rendered interaction checks; website checks when shared inputs affect it |
| Framework/input/media/public API | Native framework/game checks, API-reference coverage and applicable browser-export compatibility |
| Export/Publish/auth/transport | Existing relevant safety/lifecycle tests and real export/browser checks; required authority reviews |
| Installer/profile/wrappers/release/build inputs | Kit/provenance checks and affected platform setup/install/update validation |
| Unknown or cross-cutting impact | Full applicable existing matrix |

## Acceptance for that follow-up

- Test the classifier against docs-only, Dev-only, UI, framework, export/Publish,
  installer/profile, shared-input and unknown-path changes. Mixed changes take
  the union of affected checks; errors never silently select a smaller set.
- Show a tooling/UI PR avoiding unrelated installer and WebFX builds while
  relevant changes still trigger them. Changes to smoke harnesses exercise
  native behavior. Required aggregate checks complete for every selection.
- Verify a superseded PR run cancels without canceling another PR or a release run.
- Verify cold-cache and warm-cache execution, pinned-tool compatibility and a
  working explicit full-suite invocation. Keep credentials and permissions scoped
  as before; this work does not add release/publication authority.
- Compare time and coverage with current behavior, complete independent review,
  and pass the actual CI gate before merging workflow changes. Until then, follow
  the current workflow definitions rather than manually omitting checks.

No new task, automation, installer release or CI bypass is created by this plan.
