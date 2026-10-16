# Zero 0.5.16 release preparation

Status: **local review candidate, not a student release**. Kit/extension0.5.16,
readable core0.1.3, next native Mac build3. Published0.5.14 kit downloads and
0.5.15 Mac installer/update feed remain unchanged. Candidate hashes, source
revision and check results are retained under `.verification/student-release-0.5.16/`
and in the local candidate directory. Nothing in this preparation grants source
publication, deployment, signing or account authority.

Latest local source/package candidate: `47cc071`,
`dist/candidates/zero-0.5.16-welcome-47cc071`. Website only offers Download Zero;
desktop checks the native GitHub session, prompts Connect GitHub if needed, then
leads to tutorial creation. No separate Zero account. Native source-host Later/
cancel/retry checks pass; successful fresh-account/clone/publish and final native
installer acceptance remain pending. See [verification](VERIFICATION.md).

## What students receive

Students keep ordinary Java and JavaFX controls, explicit object updates and
readable helper source. Run App saves and checks locally, compiles a compatible
browser app and opens its preview; Stop closes it. Unsupported Java APIs produce
source-position errors. Native running remains a diagnostic option.

The GitHub section provides Upload changes and Publish app. Actions are live by
default. Upload and branch actions keep their review/confirmation steps; tutorial
projects require their own template-created repository and clone, then use the
same GitHub workflow. First Publish confirms its destination;
later explicit Publish actions update that approved site without another
destination dialog. Optional simulation is a testing setting. Publishing deploys the
same locally validated build, then offers Open app and Copy playable link. Native
workflow authorization uses VS Code's own consent/session flow and checks the
same account. Students need a supported JDK17+, Git2.31+ for uploads, and their
own GitHub repository to publish. Tutorials require a verified personal GitHub
account, Git2.31+, school-approved access/privacy and an owned template clone
before lesson0. The account setup guide covers private teacher access and commit
email privacy; public publishing is optional. They need no global Node.js or Maven.

The new source helpers include images/sprites, collisions, Sound and Music. Image
and audio compatibility remains bounded by the reviewed browser profile; this
candidate adds no asset caps or automatic transformations. Source submission in
Pika stays separate from sharing a game or library in ZeroHub.

## Evidence already accepted

The installed macOS preview created/edited a project, ran/stopped a browser app,
reported unsupported APIs and saved an exact web ZIP. Native GitHub Upload and
Publish deployed [Sky Hop](https://armorup.github.io/zero-sharing-proof/).
[Run38789445991](https://github.com/armorup/zero-sharing-proof/actions/runs/38789445991)
succeeded from sourceb3b6591. All68public files/8208661appbytes match tested build
95dc6665-5860-4674-a5cd-50fcd04a7c7c by length and SHA256. No hosted recompilation
occurred; the temporary transfer release was cleaned. Native Copy/Open and public
start/pause/restart pass. Compiler-path and upload-session fixes received independent
review. See [verification](VERIFICATION.md).

The ZeroHub source path preserves a verified publication through request, trusted
verification, immutable release and enriched catalog to Play latest. Legacy catalog
clients omit the optional web receipt. Play latest points to the student's mutable
live page; Download source project remains the exact immutable source version.
ZeroHub does not store another compiled game. Local fixtures are acceptance tests,
not public registry membership or an endorsement of a game's content.

## Pre-release fresh start

Owner decision, 2026-10-15: there are no real users or student projects to migrate.
This release may break compatibility with existing development projects. Start
fresh with a current starter or Start Project scaffold; an old-project migration
feature and an old0.5.15→0.5.16 upgrade acceptance trial are not release gates.
The full installed-candidate student flow still needs acceptance from a fresh
project, including Run, repository setup, Upload and Publish.

Older helpers still fail the strict browser fingerprints; this decision removes
the requirement to support them rather than changing the compiler. Development
fixtures may be recreated when needed. No projects were deleted and no automatic
helper-overwrite behavior was added by this decision. The maintained Sky Hop
source, public proof and unrelated working checkouts remain useful evidence.

## Required before release

1. **Publish and verify tutorial templates.** Prepare the three empty tutorial
   repositories locally, then obtain authorization to publish them as templates.
   Record verified repository IDs/commits and public template metadata, and verify
   create-own-repository/clone from a fresh student account. Also verify/refresh the
   five existing complete example templates against the current browser profile. Pending templates
   must stay unavailable; the five older complete example templates are distinct.
2. **Accept the fresh installed-candidate workflow.** Start from the current
   starter and test setup, edit/Run/Stop, repository connection, real Upload,
   Publish and Open/Copy. Existing-project migration is outside this pre-release scope.
3. **Review and integrate source.** Review the final candidate delta, authorize
   Zero's source PR/push/merge, and run the real final CI/preparation workflow on
   the selected source. A local SOURCE receipt is not a successful GitHub CI run.
4. **Coordinate ZeroHub's game policy rollout.** The retained public kit settings
   still pin `beaaca4efbbb7e9c6b0b258ef27e3bfff67c0b2e`, whose trusted publisher
   rejects the new web receipt. Do not ship this local candidate as Play-enabled.
   Select a separately reviewed, publicly available publisher source SHA; align
   operator configuration and `release/sharing.json`; deploy the enriched website
   API/UI; authorize game publication; then accept a real linked game request and
   check its public Play action. Repackage/reseal with the agreed policy pin before
   release. Library candidate execution remains closed unless separately accepted.
5. **Finish target-platform acceptance.** Test a fresh student's GitHub/workflow
   consent, Windows school policy/setup, classroom hardware/network and sound.
   The current native framework smoke check also needs a controlled Mac rerun:
   it timed out waiting for window focus at phase2, including with ARM JDK17;
   no assertion was weakened. Existing-session browser Mac tests do not establish
   these native-focus cases. Linux and Intel Macs
   are not supported student targets.
6. **Prepare the Mac distribution.** Build from clean reviewed source with native
   build3, then separately authorize signing, notarization/stapling and payload/
   Gatekeeper verification. Seal the new DMG and signed update feed. A local
   unsigned development DMG is only a preview; published0.5.15 cannot represent
   the new helper/extension bytes. Preserve the existing signed feed until promotion.
7. **Authorize exact publication.** Publish the CI-sealed kit/starter/VSIX and the
   separately sealed Mac DMG; verify their public bytes; promote only verified
   manifest/download/feed metadata through its reviewed release flow. Never replace
   old assets or guess public download URLs. See [release procedure](RELEASING.md).

The policy pin and native signing/CI gates mean the first local package is a
review artifact and will need final sealing again. No new game publish, native
Share request, registry write, account grant or ZeroHub activation is part of
this preparation.

## Current local checks

Latest account-setup source92953e2 is independently reviewed, with54 focused
setup/onboarding/tutorial,7 scaffold and18 website tests passing. Production
website build, package/extracted Maven/source parity and six saved hashes pass.
Candidate `dist/candidates/zero-0.5.16-account-ca89325` is uninstalled/unpublished.
Desktop and320px setup-link checks pass; two message-channel errors remain
unattributed. This does not replace fresh account or native/platform acceptance.
See [verification](VERIFICATION.md) for phase-specific evidence and limits.

Final root432tests:431pass/1PowerShell platform skip; website108tests, typecheck
and production build pass. Packaging and verify:kit pass, including extracted
Maven compilation and exact source/license/mode parity. All three empty tutorial
scaffolds compile with Maven; real disposable local Greeting/Game clones pass the
repository gate and GWT, and display the greeting/expected canvas in Chrome.
Tutorial website pending-template/continuation/media and320px/light/dark checks
pass. Native installed-candidate create/clone remains untested; Mac UI was locked.

Two initial independent source reviews and one targeted playground-adapter
correction review are clean. The full root rerun passes after that adapter fix.
Native verify:framework's previous focus timeout remains a separate acceptance
gap. Prior exact-build Sky Hop Pages evidence is reused for the unchanged compiler
profile. Templates and distribution remain unpublished; local fixture checks do
not establish fresh student GitHub account acceptance or public template availability.
