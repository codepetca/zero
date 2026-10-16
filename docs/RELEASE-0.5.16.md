# Zero 0.5.16 release preparation

Latest installed extension: `zero-0.5.16-auto-cleanup-0b317de` on
`codex/web-export`, reviewed with the corrected test at9ca8f14. Successful merging
automatically removes the unchanged finished local branch through the existing
safety guards, with no extra popup. The remote branch remains. Current preview
reloaded; see [EVIDENCE.md](EVIDENCE.md). Published assets are unchanged.

Status: **local preview, not a student release**. Kit/extension0.5.16/core0.1.3
are retained for isolated testing. Another chat published stable0.5.17/native17/
core0.2.0 for its separately authorized App/GameApp release; this browser feature
must advance beyond those versions before release. This branch preserves prior
sealed public assets and does not publish or overwrite that chat’s artifacts.

Latest reviewed/package source `e4e9629`, candidate
`dist/candidates/zero-0.5.16-sidebar-e4e9629`, adds the owner-selected continuous
sidebar and matching Git terms to the seven-helper strict browser preview. Actual
Mac private-template creation/Clone/Open in New Window/account+origin detection,
ordinary App edit/source-error recovery/Run/controls/cached Run/Stop, file keyboard/
watcher focus/hide-show and empty state pass. New branch and Commit & push reviews
were cancelled, preserving initial073908c/main and local-only Main edits. No fresh
signup/grant or live push/merge/Pages repeated. Full root458pass/1PowerShellskip,
website108/types/build, package/extracted kit and source/design review pass.
Two P2focus/queue issues were fixed in one reviewed batch. See
[latest verification](VERIFICATION.md) and [design QA](../design-qa.md).

Website instructions are prepared and browser-checked locally with correct three
template links, continuing-project lessons and direct Mac Silicon/Windows choices.
Hosted website and public template README Git labels still need an aligned update.
No feature source push, website deployment, signing, public game or student release
is authorized by this preview handoff. Existing Sky Hop proof remains unchanged.

## What students receive

Students keep ordinary Java and JavaFX controls, explicit object updates and
readable helper source. Run App saves and checks locally, compiles a compatible
browser app and opens its preview; Stop closes it. Unsupported Java APIs produce
source-position errors. Native running remains a diagnostic option.

The sidebar provides Commit & push and Publish app; Merge to main appears on a
change branch. Commit & push creates a commit if needed and pushes that branch;
Merge to main merges then pushes main. Actions are live by default and retain
review/confirmation steps. Start tutorial is on welcome/empty and the native
**…** menu, with Clone repository visible. Tutorial
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
The installed preview accepted a fresh armorup-owned tutorial create/clone/edit/
Run/Stop trial. Fresh native consent and the final Upload/Publish flow remain.

Older helpers still fail the strict browser fingerprints; this decision removes
the requirement to support them rather than changing the compiler. Development
fixtures may be recreated when needed. No projects were deleted and no automatic
helper-overwrite behavior was added by this decision. The maintained Sky Hop
source, public proof and unrelated working checkouts remain useful evidence.

## Required before release

1. **Align tutorial and example templates.** The three empty tutorials are public
   and anonymously verified; exact pins are recorded. Existing armorup setup trial
   passed. Integrate the other chat's GameApp rename with strict browser adapters/
   fingerprints before refreshing the current SketchApp-based templates. Verify/
   refresh the five older complete example templates. Test a fresh signup/consent
   flow; existing-session acceptance does not establish new-account behavior.
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

Reviewed sourcecbf2832 has root444tests:443pass/1PowerShellskip;7scaffold and26focused
setup tests; website108tests/build; configuration/syntax/link checks; package and
verify:kit passed. Extracted Maven/source/license/mode parity and saved hashes pass.
Candidate `dist/candidates/zero-0.5.16-templates-fbd0c33` VSIX is installed in the
owned nested preview profile, with its public template metadata. The native
installer and public kit/website remain unchanged. Independent Sol/medium review
found obsolete null expectations, fixed and accepted in one targeted pass.

Actual existing-armorup private Greeting create/clone/edit/browser Run/Stop/rerun
passes. All3template entries point to verified public repositories. Earlier3scaffold
Maven and Greeting/Game GWT/browser proofs remain applicable through exact public
source parity. Sidebar usability findings, compiler timings and release limits
are in [verification](VERIFICATION.md) and `.verification/armorup-student-flow/`.
No fresh GitHub signup/new permission, physical Windows, current-candidate Upload/
branches/Finish/Publish, or full private Study/Coin native walkthrough is claimed.
The separate native framework focus timeout and public website ZIP mismatch remain.
