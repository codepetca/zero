# Native Explorer — Mac0.5.40 publication

Owner explicitly authorized implementation, merge and publication. Source https://github.com/codepetca/zero/pull/157
merged as 5eb1e8952344166f67fbbd59c5d9c216ad8c64b5 after independent review and five exact-head checks.
Native Explorer replaces the custom tree; Zero controls and teaching New helpers
live in Explorer. Existing projects reveal the new view once. VS Code owns view
order: drag Zero above files once if needed; no private layout/state APIs used.

Public signed/notarized/stapled Mac0.5.40: https://github.com/codepetca/zero/releases/download/setup-v0.5.40/Zero-0.5.40-macos.dmg
DMG 4591706 bytes SHA256 702f63902c61179413ab016bb0a99fcb17068a8619308b447711ca923d62a800; candidate mac-0.5.40-aed95fca0806.
Clean reviewed build e508cf063223870a503c014d50a2876fc516907c; measured manifest aed95fca0806198bb093c522110d2f195cf82337.
Apple Accepted 9a9d5e62-182a-44b3-927e-3869f3e45e86; staple and actual app/DMG Gatekeeper accepted.
78affected checks plus corrected project-menu regression, root checks,116release/
2skips,159website tests/type/build and exact kit verification passed. Source CI890pass/3skip; final exact-
head metadata CI, promotion/live feed and cleanup receipts are retained under primary
.verification/native-explorer-release0.5.40 after completion.

Initial CI found one obsolete test expecting the retired custom row; corrected
and independently reviewed. Runtime unchanged; final build uses corrected source.
No native editor launch after Code Key popup or keychain/credential changes.
Native Explorer layout/selection/rename/drag and Mac update interaction await owner
smoke test. Windows21/manualkit17 and earlier immutable assets remain unchanged.
Preserve evidence and candidate before archiving the owned managed worktree.
Primary funding edits stay untouched.
