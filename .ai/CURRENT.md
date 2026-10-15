# Current state — Mac automatic-update research complete

Updated2026-10-14. Owner requested research and planning for automatic Mac app
updates. [Plan](../docs/AUTO-UPDATES-PLAN.md) recommends pinned Sparkle2.10.0,
short post-editor-handoff lifecycle, signed feed and existing DMG enclosure;
first gate is a disposable signed A→B lifecycle proof. It includes recognized
kit-upgrade session preservation, active VSIX versus installed VSIX, native
command delivery, helper termination gating, immutable versioning and recovery.
Read-only repository worker plus targeted plan sanity pass accepted; coordinator
checked relevant source and official Sparkle documentation. Documentation only;
no app changes, keys, credentials, builds, publication or release changes.
Implementation/release remains future scope. Delivery evidence in EVIDENCE.md.

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
