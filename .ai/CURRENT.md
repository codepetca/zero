# Current state — automatic Mac updates

Owner approved implementation, verification and release after the researched
[AUTO-UPDATES-PLAN](../docs/AUTO-UPDATES-PLAN.md). Coordinator worktree is
`setup-smoke-feedback/zero`, branch `codex/zero-auto-updates`; primary funding
checkout is untouched. Source [PR62](https://github.com/codepetca/zero/pull/62)
is draft. No new DMG or feed is public; existing Mac14 and Windows kit14 remain.
Kit15 is local, native build2, core0.1.2. Main07e268e/PR63–64 incorporated.

Pinned Sparkle2.10.0, signed feed/archive, strict nested signing/provenance,
update-only commands and session-preserving kit upgrades implemented. Source
284ec1a passed two initial independent scopes and one targeted remediation review;
CI38668181115 passed. Native293 assertions, root263/1skip, website/type/build,
focused updater tests, extracted dependency/kit verification passed. Two P2 fixes
(feed staging and older CLT Python) were batched once. Review ledger currently
5/7 launches; one bounded main-sync integration pass and final artifact delta remain.

Signed/notarized automatic A→B and negative cases passed in
`.verification/updater-live-e5UzgR/receipt.json`. The first manual UI test was
invalidated by Cua accessibility inspection reopening the terminated app; this
side effect was reproduced independently. Native code remains unchanged. Owner
unlocked Mac; repeat manual fixture is running without a post-quit target read.
No actual owner editor/student data used. Real unsaved buffers/Java, managed Macs,
Intel/macOS12 remain untested; see [EVIDENCE](../docs/EVIDENCE.md).

Old sealed candidate `dist/candidates/mac-0.5.15-6809d99c3686` is retained unchanged
with clean independent crypto/compat reviews. New main changes student README,
so build and seal a fresh candidate after source integration review. Preserve old
receipts; never overwrite sealed outputs or existing public assets. Production key
stays private outside Git; do not print/read it or rotate credentials.

Next: finish manual fixture acceptance, review synced delta, push/update PR62,
verify exact-head CI and merge. Build/sign/notarize/staple fresh candidate, sign
final DMG/feed, independently review artifact delta, publish one immutable
setup-v0.5.15 DMG, verify anonymous bytes, then reviewed metadata/feed promotion
and live production verification. Keep kit15 local and published Windows kit14.
No tool-backed goal, new chat or automation. Weekly60% remaining, storage311GB
healthy at last reading; DeepSeek paused through2026-12-31.
