# Current state — Windows automatic setup/update implementation, 2026-10-16

Owner authorized implementing Windows installer and automatic updates to match
the Mac flow; preserving existing student work/settings is not an acceptance
requirement. Existing filesystem boundaries still apply. No publication, push,
merge, signing credentials or account changes authorized by this request.

Working branch codex/windows-auto-setup, base e268b93. Original dirty funding
checkout and separate web-export task remain untouched. Current published Mac,
kit assets and feed bytes stay immutable; Windows remains unavailable publicly
until separately signed, Windows-tested and released.

Coordinator owns launcher/UI lifecycle, integration, docs and acceptance. Native
runtime worker (requested GPT-6.1 Sol/high) owns WindowsRuntime* helpers, verified
Windows vendor pins and RuntimeHarness. Updater spike worker (Sol/high) owns only
ignored investigation artifacts until package/authentication contracts are agreed.
No recursive delegation. DeepSeek remains paused under the owner override.

Target: signed per-user installer/Start shortcut, automatic private Java and
isolated editor setup, first starter/subsequent saved-session open, due background
checks after editor handoff, helper-gated authenticated newer launcher updates,
Windows manual update/preferences commands, useful failure/retry and offline use.
User waived migration preservation; no arbitrary-directory deletion is needed.

Implementation integrated and local development package built. Native690+updater11
fixture checks, root279pass/1skip, website102/typecheck/build, pinned vendor ZIP
hash/extraction, kit/config and actual vpk package verification pass. Windows
production remains blocked on separate key/signing authorization and real-device
acceptance; no public download change. No arbitrary work/settings deletion added.

Current phase: independent high-risk full-diff review, two fresh Sol/high workers
(security/correctness; lifecycle/compatibility), fixed local commit. Review budget:
7launches/1initial/4targeted/1integration/4fix batches/60min;2initial launches planned,
zero fixes. Coordinator alone integrates. Next: accepted corrections and affected
checks, final local artifact/receipt and handoff. No publication/merge authorized.

Evidence in docs/EVIDENCE.md and ignored .verification/windows-auto-setup. Requested
worker model/effort noted there; effective configuration/task tokens unknown.
Weekly remaining54% before review; storage healthy. Keep this managed worktree
attached with its local commit/artifacts for owner review.
