# Current state — Mac automatic updater implementation

Owner said “Do it” after the researched [plan](../docs/AUTO-UPDATES-PLAN.md):
implement, verify signed upgrade chain, review and release updated DMG/feed.
Branchcodex/zero-auto-updates in setup-smoke-feedback worktree; primary untouched.
Plan receiptbe98127; implementation still uncommitted. Kit/extension15local,
native build2; old publicMac14/Windowskit10 remain unchanged. No publication yet.

Native+packaging+extension workers delivered: pinned Sparkle2.10.0, exact URL
requests/cold marker,120s unattended lifecycle, recognized-kit resume, full nested
signing/strict proof, development isolation. Native293 assertions and both-arch
compile passed; focused updater/feed/installer checks passed; website94/type/build
and config passed; full root tests running in .verification/updater-root-tests.log.
Coordinator integrating strict receipt/feed seals and docs; source review0/7 yet.
Independent security+compatibility reviews required before source merge/release.

Production Ed key generated in Keychain accountca.codepet.zero.updates; private
600 recovery copy outside repo under ~/.codex/private/zero-updater/ed25519.key.
Only publickey in release/mac-updater.json. Sign_update Keychain access stalled
whileMaclocked; privatefile signing works; no credential values exposed/policychange.

Real signed/notarized fixture automatic A→B PASSED under
.verification/updater-live-B3RZjL; sentinelfiles/dummyeditor survived, exactnewtree,
no relaunch. Firstharness run laterfailed overlystrict no-updateexpectation;
updates_live worker running corrected negatives in updater-live-094Zcb.
Nativeworker finalizing explicit production rejection of fixture-only launchmode.
Manual actualInstall still required; Cua reportsMaclocked, userasked asyncunlock.
Continue independent work; do not claimmanualUIorrealunsavededitor verified.
Liveworker owns scripts/test-mac-updater-live.mjs+ignoredfixtures only; coordinator
otherfiles, nativeworker main.swift only until final handoff. No goal/automation.
Weekly62%remaining,313.6GBhealthy; DeepSeekpaused through2026-12-31.

## Last delivered installer

Updated2026-10-14. Owner authorized centered minimal drag-to-Applications screen
and preparation progress below text, then release for smoke testing. SourcePR59
merged57a2f70 after Sol/high reviewb913329 and CI38636537778 success. Kit14local,
core0.1.2 and Windowskit10 unchanged. Primary/other worktrees untouched.

Signed/notarized/stapled singleDMG setup-v0.5.14 released, tagprepec1d64a,
builtb913329; exactpublicHTTP200824261bytes SHAabc44bdc86446139c7cd77d04b555b01fef13dc39b2bef251e0de1a56ae7b8f0.
Two Sol/high artifact scopes passed; metadataPR60 merged437ae7c after Sol/medium complete reviewcfd4d80 and
CI38638590543 success. Production7077541352 succeeded; live14Mac/10Windows
anchors and both linked HTTP200 size/SHA verified21:23:21UTC. Delivery complete;
branchcodex/zero-dmg-0.5.14-smoke-receipt retains completion locally.
Layout uses versionedvolZero0.5.14 to avoidoldermounteddisk backgroundaliascollision,
strict hiddenDSStore/arrow/nativealias/HFSautoopen metadata. Maintainerhash-pinned
Pythonhelper only; no Finderautomation/globalprefs changes. ActualCuafixturecenter
verified; finalsignedFinderwindow notcaptured becauseMaclocked, actualNSWorkspace
signedappicon correct and strict layout/Gatekeeper app+DMG passed.
Mac250UI assertions reusedunchanged, root259/1skip,35focused/website94/type/build,
kit/extractedverificationpassed. Fresh-machine/macOS12/Intel/physicalWindows and
quarantinedfirst-open interactiveflow remain untested; ownercontinuessmoketest.
NoWindows/kit/Hubpublication or credentials changes. Sealed/privateevidence retained
under dist/candidates/mac-0.5.14-ec1d64a06e2b and .verification/release-0.5.14/.
No goal/task/automation. Reviewledger4launches source1/artifact2/metadata1,0reviewfixes;
packagingimplementation required2pre-reviewgeometry/alias corrections.
