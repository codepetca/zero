# Current state

Updated 2026-10-12. Read docs/PRODUCT.md and docs/DEVELOPMENT.md before edits.
Durable phase history: docs/EVIDENCE.md and docs/VERIFICATION.md.

## Active hub build — local vertical slice

Owner waiver 2026-10-12: “Override budget constraints and proceed.” Applied
override-task-stops to this task's agreed local hub implementation, checks and
independent review. Workflow review/low-usage stops are waived; cumulative ledger
continues at four launches/two targeted waves/two fix batches. Provider execution
limits, paused DeepSeek, correctness gates and no-public-action scope remain.
Coordinator owns Docker/runtime/integration; Sol/high hub_login_fix owns a bounded
website local-session diagnosis and focused correction. No recursive delegation.

Latest checkpoint: source d327fbe, saved locally; implementation is not accepted.
Final checks passed: 254 root tests, 49 website tests/types/build, 17 actual
PostgreSQL cases, six pure checker/report cases, 14 bounded JDK regression
processes, and the trusted starter's native macOS JavaFX proof.
The isolated Docker suite failed all six cases at image startup, and the full
hub/Maven proof failed before a valid contribution could publish. Fresh BuildKit
build/readiness succeeded, but Docker's loaded image contains a zero-byte
/__cacert_entrypoint.sh and exits with an exec-format error. Removing and
reloading only this generated checker image did not fix it. No volume reset,
Docker.raw deletion or unrelated image removal was attempted.
The owner's explicit restart request was executed with the official Docker CLI;
all 23 existing services returned running, with all configured health checks
healthy. Owned local hub/website proof servers and disposable database stopped.
The local browser showed the preparation page, but sign-in did not visibly
advance; browser reservation/upload/download flows remain unverified.
Independent initial security and compatibility reviews found five blockers;
two fix batches addressed them. Both targeted reviewer attempts were blocked
by the provider's possible-cybersecurity-risk filter. Four reviewer launches
total; the 60-minute review window elapsed at 08:49 Toronto. Do not continue
source remediation/reviewer launches without an explicit budget extension;
self-review does not satisfy the missing corrected-source independent pass.
Next: recover a valid checker runtime without disturbing other Docker data,
then run the actual checker, hub/Maven and browser flows; obtain independent
review of the corrections within an explicitly extended review budget.
No push, PR, merge, deployment or public package publication occurred.
The older progress notes below are historical; this checkpoint governs status.

Owner says orchestrate the build. Coordinator implements the existing plan using
hub/CONTRACT.md as the shared interface. Base ed71f4d; branch/worktree unchanged.
Implementation authorized locally; no push/PR/merge/deploy/publication or live
OAuth/account provisioning. Primary funding checkout and Community main preserved.
Weekly76% remaining at start (account allowance, not task cost). DeepSeek paused.

Delivered ownership: Sol/high hub_service owns hub/service, sql, package/lock;
Sol/high hub_checker owns hub/checker; Sol/medium hub_website owns website.
Service/website delivered; checker source ready, actual runtime proof pending.
Service policy-digest/complete-gate hardening finished; all source writers stopped.
17 expanded PostgreSQL cases await recovery; pure report3/3 passed. Trusted
development ZIP scaffold compiled and native JavaFX label check passed on macOS
ARM64 (hub-development-proof-fixed/native.log). Full hub proof still pending.
Coordinator owns contracts, extension integration, fixtures, proof and docs/Git.
No recursive delegation. Effective model/tokens/cost/active time unknown.
First exit: real PostgreSQL reservations/ownership and immutable versions; offline
Docker JavaFX build/check; useful failure reports; actual local listing/Maven
consumer; simple website preparation/upload/discovery. Local fake publication
only. Independent high-risk security and compatibility source review required.
Hosted OAuth/database/storage/worker rollout remains an explicit later deployment.
252 root tests, 47 website tests/types/build, 15 actual PostgreSQL tests and 3 pure
checker validation tests pass. New extension engine/action tests are included.
No Docker checker or integrated Maven-hub success yet: JavaFX ARM64 GLIBC/native
requirements required a pinned Noble image; Docker VM then became read-only on
this near-full Mac. Removed only regenerable npm cache/old Zero vendor binaries,
keeping source/history/receipts/student files/user data/Docker volumes. Available
host space rose from1175124KiB to2757500KiB. Docker still cannot create a container.
Owner explicitly authorized Docker restart on2026-10-12. First restart restored
all prior services, then imagebuild refilleddisk/read-only VM again. Build stopped;
inactive Playwright downloads reclaimed (activebrowser/daemon retained). A separate
Free Mac Disk Space task is active; broadercleanup is leftto that task. No volumes
or unrelatedprojectfiles removed. Normalsecondrestart stalled; confirmedDocker
backend had no VMdiskhandle, gracefultermination failed, backendterminated for
restart under sameauthorization. Finalrecovery/free-spacecheck pending.
Current proof commands: hub/README.md, scripts/verify-hub.mjs; generated image lock
and bulky evidence ignored. Source review proceeds independently of engine recovery.

## Latest hub design decision

Owner removes routine maintainer acceptance from the proposed public hub.
Authenticated contributions passing a trusted automated minimum-standards checker
will publish/list automatically. Short library IDs are hub-assigned; student
imports use zero.ui7.Hud, owner/version remain metadata. Authoritative new design:
docs/COMMUNITY-HUB-PLAN.md. Legacy helpers still implement human acceptance;
the isolated generic checker/publisher and DB hub are now implemented locally,
with runtime and corrected-source review gates still incomplete. No remote
setting, current artifact publication or repository merge changed.

## Completed local Starter UI package proof

Owner approved packaging the tested StartScreen, Hud and ScoreDisplay, consumed
unchanged in study and coin-game examples, before generic Workshop/catalog work.
Zero worktree: /Users/stew/.codex/worktrees/kit-integration/zero, branch
codex/app-game-tutorials, base862c081cdf94be641a67a54f1c5320e76890c3d0.
Community worktree: /Users/stew/.codex/worktrees/starter-ui-local/zero-community,
branch codex/starter-ui-local, base31febf2f22228553e40e96abe92bcbbf83032815.
Coordinator owns integration/docs/state/Git. One Sol/medium worker delivered the
module and proof tool; stopped. No recursive delegation. Weekly80% remaining at
start is account allowance; effective model/tokens/cost/active time unknown.
DeepSeek remains paused through2026-12-31. No new goal/task/automation. No active workers.

Package ca.codepet.zero.community:starter-ui:0.1.0-prototype.1 contains three
ordinary classes in zero.community.starterui, pinned Java17/JavaFX21.0.12, MIT.
No core dependency or Application/game classes. Default-package teaching sources
remain separate. Packaged-study/game import the library; their Main owns rules.
Build proof verifies two reproducible binary/source JARs, exact source/POM/license,
finite behavior/origin and both consumers in a fresh isolated cache. Empty user/
global Maven settings now apply to all steps. Source proof complete. Fresh Sol/medium review of both repositories passed with
0findings/blockers, complete23-file coverage,1launch/initialwave/0fixbatches.
Accepted Zero e7b03d8ab37c9c3323e04462b705b993d2f2ba1b and Community
19e3544da52691c1d39492fb78ee9dd962898536. Final receipt is
.verification/starter ui accepted source/receipt.json; prior settings trial is
.verification/starter ui proof final/. Guide docs/STARTER-UI-PACKAGE.md.

Scope: local source/artifacts only; no push/PR/publish/deploy/account changes.
No public coordinates/catalog/release changes, no health-bar source/metadata,
no framework/default-starter/POM or installer changes. Current Workshop still
supports only its two health bars. Generic descriptors/checks/preview and catalog
multiple-library support remain proposed, not implemented. Physical input, novice,
Windows/Linux/Intel and actual catalog installation remain untested.

## Accepted earlier local work

Visual tutorials and composed source examples accepted at6e32ecccb4f317e6b605fcbe9d23258229c3027d
plus receipt862c081:13target illustrations/three-action checkpoints,14finiteGUI
cases,38website tests/types/build and full47-file review passed. Earlier tutorial
pass f2753a0 added native controls and shared ScoreDisplay. See durable evidence.
Health-bar local Workshop/edit/build/export/admission trial passed; packets are
checked, not accepted/published. Generic StartScreen is rejected by that contract.
Community contribution-guide file-count/protection claims need later correction;
canonical Community remains untouched by those trials.

## Published baseline and holds

Signed/notarized Mac setup0.5.7 is public fromf9a5ef2; production website metadata
PR25 merged atb9d0188e47ae0686890b4236f65ff1474fff4f9f. DMG899924bytes SHA256
 d639fc080670eb11fc03e63c56356c8da1603bf956e44d5b135511f52aa9ba1b.
Standalone ZIP/starter/VSIX remain0.5.3; Community0.1.3 remains public/experimental.
No earlier publication authority carries into this local phase. Existing releases
and sealed candidates are immutable. Installer/physical Windows trial remains held.
Primary Zero funding checkout and canonical Community main are preserved.


## Source review ledger — current build

Initial high-risk wave: Astra/high security and Sol/high architecture, baseed71f4d
→973daf1; completeassignedcoverage, changesrequired. 2launches/1initialwave.
Accepted5findings: methodhandle/nested-thread verdictforgery, proxyloginredirect,
MIT/POM contract, selectedolderrelease metadata, Java-source whitespace shadow.
Fixbatch1 underway: closedJPMSobservermodule+realJDK17attack/lambda regressions;
frontendredirect+cookie regression andexactrelease selection; extension usesactual
trustedPOM andJavaUnicode/comment/string declarationpreflight. Coordinatoralso
fixesquietFiles viewfor downloadedlibrarylayout andnondeterministicconcurrent
publisherfixture ordering. NativeDocker/fullintegration remainpending. Atmost
7launches/4fixbatches/60minsource-review session; runtimeenvironmentwork mustnot
resetbudget. Effectiveconfigs/tokens/reviewerelapsedunknown; source frozenagain
beforeoneAstra/high targetedfix review. No remoteauthorization.


## Latest verification and review hold

Correctioncommit0bc6faa recordsfixbatch1. TargetedAstra reviewturn failedprovider
cyber-risk contentfilter; onepassive-defensive retryalsofailed, no alternateworker
orprovider bypass. Ledger4launches (2initial,2failedtargeted),2targetedwaves,
2fixbatches; independentcorrected-source acceptance remainspending. Budgetclock
started07:49America/Toronto; no newreviewer/remediationafter08:49withoutexplicit
ownerextension. Providerrejections are reported, not cleanreviews.

Dockerrecovered; all23priorservices restoredhealthy. Broaderseparatecleanup has
freedroom (notthis task'screditedsavings). Finalchecks254root/49website/types/build,
17actualPostgreSQL/6purechecker+report passed. NativeDockerbuild nowfailsbecause
cachedNoblebase'slibjvm.so is truncated fromdiskfull; scopedreclaimable unshared
Noblebuildcache records are beingpruned/rebuilt, volumes preserved. Runtimeproof
stillnotclaimed. Fixbatch2 beforebudgetend: stateless image-readinessApplication
movedto hub.smoke, qualifiedJavaFXexportonlythatpackage; hub.policy state remains
closed. ActualJDKstubtest updateddummyexportpackage andpassed. No publicaction.
