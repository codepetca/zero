# Automatic Publish recovery — source work, 2026-10-21

Owner requests automatic Pages setup, untouched stock-helper upgrades and stale
browser-build lock recovery. Work is isolated on codex/publish-recovery from
6e584267; the primary funding checkout remains untouched. The local374-test affected
suite and31remediation checks passed. Two independent reviews and the targeted
correction review are complete with no remaining blockers. See docs/EVIDENCE.md
and https://github.com/codepetca/zero/pull/165 for CI and rollout approval. No new installer,
production permission grant, student repository mutation or live release yet.
The reviewed Pages setup path needs Administration write; the compatible client
must release before the existing App registration changes, because older clients
pin the former exact grant. Existing sites and custom helpers remain protected.

# Compact ZeroHub project squares — local, 2026-10-21

Owner refined the layout to one square: title fades over the top, stars/report/
author sit at the bottom, description appears on hover/focus or title toggle.
Unconfirmed site previews are muted using repository-matched reachability only.
Implementation is isolated from the primary dirty funding checkout at base59c414f7.
No publication authorized. Preview http://127.0.0.1:3135/hub. See
[delivery evidence](../docs/EVIDENCE.md) for checks, review and limits.

# Corrected editor popups — Mac0.5.43 publication

Owner explicitly authorized merge and release. Source https://github.com/codepetca/zero/pull/162
merged as 63bbf25d96a2ff953c48f806a2f7a0b23f041575 with five exact-head CI checks. The shared
text-input helper now puts its short title above the field and the keyboard hint
below it. Commit & push and Publish use Commit Message and an empty field.
Supported editors before1.108 use native InputBox, avoiding proposed-only setters.
Native Explorer and the existing guarded Publish save/commit/push/deploy flow remain.

Public signed/notarized/stapled Mac0.5.43: https://github.com/codepetca/zero/releases/download/setup-v0.5.43/Zero-0.5.43-macos.dmg
DMG 4602116 bytes SHA256 53d1b32079f30d063eda59f7a49a0504dedb34ee136378979a5725a0f908670a; candidate mac-0.5.43-b1fb96ce99b6.
Clean reviewed build 27c18737c0f21bdaeed419b562e8b29227e399a7; measured manifest b1fb96ce99b6f9b7b50fa19b5b0307cf8fca54c2.
Apple Accepted 959aaad8-6d64-40b9-bbee-f95463392a5d; staple and app/DMG Gatekeeper passed.
55focused and16isolated recovery checks passed. Broader167passes/1timeout under
parallel load passed on its isolated rerun. Configuration,99release/2skip and
exact kit/candidate checks passed. Initial source review P2 was fixed and accepted;
version/integration review clean. Publication/promotion receipts and final checks
are retained under primary ignored .verification/popup-release0.5.43 at completion.

Signed feed advances42→43. Prior immutable assets, Windows21/manualkit17 and the
primary dirty funding checkout are preserved. Native rendered-popup/update and
live student Publish remain user acceptance checks. No credentials changed.
