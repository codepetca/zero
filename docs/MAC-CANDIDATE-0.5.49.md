# Mac 0.5.49 candidate acceptance — 2026-10-24

Historical candidate acceptance below predates owner-authorized publication on2026-10-25.
See the [current publication receipt](EVIDENCE.md#mac0549-authorized-publication--2026-10-25).


The corrected local Mac candidate is signed, notarized, stapled, sealed and
installed for testing. It is **not published or approved for student rollout**.
Public Mac download and production feed remain0.5.47. No push, PR, merge, feed,
site, template deployment or release publication occurred in this continuation.

## Exact candidate

- Kit/extension0.5.49, core0.3.0, native build49.
- Built from clean source e5953f05e3f0d0e8e503acc5c419237f39113284.
- Preparation52fa3120f04562c8c51f1bf3dbed3979e1685003; protected build inputs
  remain equivalent. Sealed directory `dist/candidates/mac-0.5.49-52fa3120f045/`.
- DMG `Zero-0.5.49-macos.dmg`:5,916,593bytes;
  SHA256 `182b79fffebb7bce665db242a5867e5592a1510f62472ee86841262c14e879ee`.
- Apple Accepted submission af289c5b-debc-46ac-bdf3-dd7d5537faf9. Actual staple
  validation and app/DMG Developer ID and Gatekeeper assessments pass.
- All13checksum entries verify; DMG and appcast Ed25519 signatures verify
  against the pinned public key. The sealed0.5.48 candidate remains intact.

## Native Run corrections

Actual tracing reproduced a running game stopping when Tasks: Configure Default
Build Task merely listed choices. VS Code also invokes that resolver at startup.
Task resolution now has no execution side effects. The old two early attempts
had no retained trace, so their individual causes remain unproven.

Real-host testing found two additional failures that the original mock missed:
VS Code reused the task identity for manual and configured Run, losing Stop
ownership after a rejected retry; repeated configured Run was inert while its
long-lived task remained active. Registered per-run identity and a finite
configured launcher now route both controls through the same native Run pipeline.
The actual app task owns compilation, readiness, Problems and Stop. Completion of
its configured launcher means the request was dispatched, not compilation success.

Run validates the next launch before stopping a live app, reserves preparation
across entry points, rechecks workspace trust before spawning, and rejects late
cancelled task events before replacing ownership. A task that exits before the
host reports its start still publishes compiler/runtime Problems and its final
error state without leaving a phantom Stop control. No public Java API changed.

## Actual installed acceptance

The exact sealed DMG was mounted read only and its app manually replaced48in
Applications. Opening49prepared the kit/VSIX and automatically reloaded the idle
private editor. Installed Extensions showed48before and49after. The actual
unsaved text “Zero RC upgrade preserves this unsaved note.” survived the reload.

- First sidebar Run after the upgrade reached App UI ready with No Problems.
- Opening the default-build task picker preserved the same two live Java PIDs.
- Repeated Tasks: Run Build Task replaced both JVMs and recompiled Main. Both
  keyboard requests reached App UI ready.
- With the disposable fixture's wrapper temporarily held, another configured
  Run displayed the missing-file error while preserving the same live PIDs,
  App UI ready and Stop ownership. The wrapper was restored; explicit Stop left
  zero fixture JVMs.
- A deliberate missing semicolon produced a Zero Java compiler Problem at
  Main.java11:51. Clicking it selected that position. Restoring the exact source
  and repeating keyboard Run returned to App UI ready with No Problems.
- The installed host opened the retained real WebFX export. Typing Sam, Cmd+A,
  then Alex replaced the field and Say hello displayed Hello, Alex! The preview
  was stopped afterward. Fresh WebFX compilation and clean-folder setup were
  already accepted with48; this unchanged browser/build path was not rebuilt
  again in49.
- Three original student repositories retain their exact tracked source/build
  bytes, HEAD and Git status. Editor settings and156existing bundled-starter
  source/build files match the private pre-upgrade backup. The disposable Main
  and wrapper are restored. Student project framework/build pins were untouched.

Source-host checks also reproduce first game frame readiness, picker stability,
configured restart/refusal/Stop, cancellation during compilation and compiler
recovery. Native JavaFX window gameplay/input was outside the automation surface;
readiness records, source navigation and actual process state are the evidence.

## Checks and independent review

Reviewed source full matrix:1,141pass,3Windows/PowerShell skips,0fail (258.2s).
Final native integration/runtime/command checks:19pass,0skip. Root configuration,
syntax and documentation checks, diff check, kit archives/source parity/extracted
Maven build, signed installer verification and candidate sealing pass. No new
GitHub CI run was triggered because publishing source remains held.

One independent Sol/high reviewer performed four source-review turns, ending in
clean targeted closure at e5953f05, and a separate sealed-artifact review. Five
correction batches followed the initial resolver fix, including actual host
findings and the fast-exit regression. The author was a separate Sol/high worker;
parent verified integration and actual UI. Effective model, worker token use and
per-turn elapsed time were not exposed. Account-wide usage is not task cost.
No unresolved actionable source or artifact findings remain.

Ignored proof: `.verification/native-run-startup/` retains traces, negative
controls, PID/class-mtime samples, tests/build/notarization/sealing logs, screenshots
and preservation receipts. Original48app/kit/private editor and installed app
rollback copies remain outside Git. The upgraded private editor remains available
with its unsaved note; test apps/previews are stopped. Zero Dev watcher/profile
remain preserved, with its source editor closed normally for isolation.

## Separate release gates

The47→48and48→49manual upgrade/editor handoffs are accepted. Actual production
Sparkle download/install delivery of49has not been exercised: the published feed
still serves47. A signed local feed is sealed but not published. Rollout still
requires explicit authorization and normal source/CI/release gates.

Clean-folder48setup ran on this existing Apple Silicon Mac with cached tools.
A separate fresh Mac, managed school network, physical Windows and physical
native-window gameplay remain unverified. The earlier lesson0–11/live-auth rollout
record remains applicable; this continuation did not repeat or publish it.

Pilot preparation,2026-10-24: a version-specific [operator guide](pilots/mac-0.5.49/README.md),
[school IT inventory](pilots/mac-0.5.49/NETWORK.md) and
[unrun result template](pilots/mac-0.5.49/RESULTS.md) are ready for a private
transfer pack with the exact sealed DMG. This adds no fresh-machine or school
acceptance evidence and changes no candidate bytes or publication status.
