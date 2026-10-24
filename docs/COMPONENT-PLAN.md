# ZeroHub consolidation plan

Owner direction: one Zero repository, ZeroHub brand, `/hub` address. Replace the old separate catalog/Workshop/maintainer admission path with the generic automated library flow. The historical compatibility exception applies only to that obsolete pre-consolidation system and its fixtures. Preserve current student repositories/history, accepted releases and installed pins; future migration follows the [framework architecture plan](FRAMEWORK-ARCHITECTURE.md)'s versioning and credit rules.

1. Move useful Starter UI and health-bar source, notices, tests and examples into `libraries/`.
2. Remove old Community routes, catalogs, Workshop, extension actions and release asset dependencies.
3. Update tutorials, development commands and repository contracts to one flow.
4. Verify prepare → preview → upload → check → automatic listing with contributor credit → Add → Update → Revert, including two real consumers.
5. Complete outstanding checker review and separately authorize/configure hosted activation.
6. Retire the obsolete external source repository after useful source is consolidated and checked.

These remain the consolidation work items. Current execution/evidence belongs in
[.ai/CURRENT.md](../.ai/CURRENT.md) and [VERIFICATION.md](VERIFICATION.md).
Publication/deployment still require applicable owner authorization.

## Core learning and architecture direction — 2026-10-23

The owner made student-led framework evolution a core goal: students extend or
replace components, share exact versions on ZeroHub, improve them through reuse,
and propose proven ideas for Zero core. Follow the
[framework architecture plan](FRAMEWORK-ARCHITECTURE.md) for the runtime and
public extension contracts. This adds a learning/portability acceptance track;
it does not reopen the hosted checker gate or declare the consolidation complete.

1. Agree the lifecycle and smallest public replacement contracts using ordinary
   Java. GameApp extends App and owns gameplay; Screens are optional UI views.
   Keep simple apps free of mandatory Actor/World/Screen machinery. Main may
   select default or alternative WorldContent without a GameScreen hierarchy.
2. Prove a missing steering helper and a substituted animation implementation in
   two game consumers without editing canonical helper source.
3. Reuse one unchanged UI/helper source in an App and GameApp, including actual
   managed local and pinned-library source export rather than manual copying.
4. Verify native behaviour and real WebFX browser execution, resources, input,
   pause/restart and error paths before calling a component portable. Validate
   core-dependent library build/version support instead of assuming it exists.
5. Complete a separately authorized Pages/gameplay proof for the candidate
   architecture and library path. Retain the create/clone, branch, Run, Commit &
   push, Merge to main, explicit Publish app and separate Pika workflows.
6. Exercise the contribution-to-core decision with attribution, version migration,
   examples/API documentation, CI/review and immutable existing artifacts. A good
   independent library need not be promoted into core.
