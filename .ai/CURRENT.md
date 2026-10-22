# Tutorial and reusable editor controls — local, 2026-10-22

Owner-requested source is on codex/tutorial-padding: tutorial padding, compact
GitHub account row, Tutorials under the equally wide Start tutorial split control,
and Start Page dropdowns matching Sidebar. Source2d041c7c extracts shared button/
menu/split/chevron styles and adds actual-renderer component prototypes. The
reuse preference is recorded in design.md, design/EDITOR-COMPONENTS.md and saved
Product Design context. Review future controls in the local /components gallery.

35focused tests, configuration and generated-design checks pass; independent
Sol6.1/medium review complete/clean. IAB verifies matching menu styles, theme/state
switching and320px reflow. Gallery running at http://127.0.0.1:3152/components.
Earlier padding/account/menu validation remains valid. Both local owner Greeting
projects retain separate uncommitted padding edits. Installed Zero44, public
templates/site/demo pages are unchanged; merge/publication awaits applicable
owner authorization. See docs/EVIDENCE.md and primary ignored
.verification/shared-editor-controls-20261022/result.json for receipts.

# Automatic Publish recovery — Mac0.5.44 delivered, 2026-10-22

Owner-authorized source/release work is complete. Source PR165 merged3bc83141,
version PR166 mergedc01de5ee and promotion PR167 merged68386794, each after five
exact-head checks. Signed/notarized/stapled Mac0.5.44 and its exact signed update
feed are live: https://github.com/codepetca/zero/releases/tag/setup-v0.5.44.
The built-in updater installed43→44 on the owner's Mac and preserved the project
edit. Administration write is now registered on Codepet Zero and the existing
owner installation approved the added grant. Future installations request it;
existing users must update their client before approving. Older43 clients reject
the additional scope. No credential or repository-selection changes were made.

In installed Zero44, Publish committed an uncommitted greeting edit, pushed main,
built and deployed successfully. The public https://armorup.github.io/my-greeting/
showed the new greeting and passed the name/button interaction. The corrected
Commit Message title and hint below the field were observed in the native editor.
See docs/EVIDENCE.md and retained primary ignored
.verification/publish-recovery-release0.5.44/progress.json for exact receipts.
This acceptance used an existing Pages site. First-time Pages creation, stock-helper
upgrade and stale-lock recovery have automated coverage but were not re-exercised
live in this run. Physical Windows/Intel/macOS12 remain untested. Windows21,
manualkit17, immutable older assets and the dirty primary funding checkout remain
preserved. No pending release or permission step remains for this request.

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
