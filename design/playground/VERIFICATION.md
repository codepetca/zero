# Local review-kit verification

Verified 2026-10-13 on macOS in the Codex in-app browser. The exact source base is
`639da3173d6eed71869bdb1365f6ef67a6fafdbd`; the proposal is the local working
diff in the attached `zero-design-review` worktree. Screenshot labels explicitly
say **base + local review**, rather than claiming the proposal is in that commit.
The ignored source manifest (`../../.verification/design-review/source-manifest.json`)
records exact input file hashes; screenshot index (`../../.verification/design-review/INDEX.md`)
lists all captures. These paths are local artifacts, deliberately outside Git.

## Performed checks

- 11/11 Node checks pass: shared schema/key parity, web contrast pairs, native
  host mapping and precedence, high-contrast/forced-colors fallbacks, served
  assets/routes, read-only fixture boundary, published Windows fallback and
  actual Ready/Error renderer. `git diff --check` passes.
- Rendered Learn/downloads inspected at 1024px desktop, 768px comparison,
  390px mobile and 320px reflow. Both themes retain all 13 source lessons, help
  choices, required copy and both platform buttons. Both themes at 320px and
  200% text have no page-level horizontal overflow. Text grows from 16px to
  32px; controls wrap/stack and the page scrolls vertically.
- Sidebar Ready/Error inspected in both simulated themes at 320/240px,
  plus an actual 200px iframe at 100% and 200% text. Run/Stop stack at 200px;
  error text and actions wrap. The standalone browser clamps requests below
  240px, so 200px evidence uses the iframe. Screenshot filenames were corrected
  to match measured widths rather than the requested standalone width.
- Tab moves from Start lesson 0 to the first disclosure; Enter expands it and
  focus remains visible (3px purple outline). The high-contrast sidebar skips
  disabled Stop, focuses Show Problems (2px yellow outline), and Enter gives
  explicit fixture recovery feedback. Run, Windows download, Show Problems,
  fallback themes and Reset were exercised. No browser console errors/warnings
  remained in the inspected preview.
- Rendered normal text/action samples: light web 6.07–19.09:1, dark web
  7.77–17.16:1; simulated light editor 6.31–19.09:1, dark editor
  4.53–17.16:1. Node checks also cover proposed semantic borders/focus at 3:1
  and text/link/error pairs at 4.5:1. This is sampled contrast evidence, not
  comprehensive accessibility certification. Disabled controls are not included.

## Visual review result

Local review-kit QA: **passed for owner inspection**. The white/purple reference
hierarchy, supplied brand geometry, restrained corners and system typography
are retained. The proposal intentionally uses the current 13-lesson source and
requested copy instead of the older six-lesson mock text. Learn has a purple
web primary; editor controls demonstrate native host blue while sharing hierarchy,
spacing roles and modest corners. The dark companion and stronger review borders
remain proposals. No screenshot baseline is silently approved.

Inspect the paired comparison captures first:

- Light Learn + Ready, web768/sidebar320 (`../../.verification/design-review/compare-light-ready-web768-sidebar320-base639da317.jpg`)
- Dark Learn + Error, web768/sidebar320 (`../../.verification/design-review/compare-dark-error-web768-sidebar320-base639da317.jpg`)
- Dark 320px web + 200px sidebar, 200% text (`../../.verification/design-review/compare-dark-error-web320-sidebar200-text200-base639da317.jpg`)
- High-contrast fixture with keyboard focus (`../../.verification/design-review/compare-hc-error-web320-sidebar200-keyboard-focus-base639da317.jpg`)

## Independent review and effort receipt

Two bounded implementation workers requested GPT-6.1 Sol/medium: token adapter
and guidance ownership were separate, verified by coordinator reads and Node
checks. Guidance delivered in roughly 2 minutes; tokens in roughly 4 minutes
(manual estimates). No integration conflict. Effective configuration and worker
tokens are unknown. Initial account reading: 95% weekly remaining, storage
healthy at about 340GB available; these are account/machine readings, not cost.
DeepSeek remained paused.

Review started about 09:25 America/Toronto. One GPT-6.1 Sol/medium launch failed
at model capacity. One GPT-6 Sol/medium fallback completed the full new-code/doc
scope; one P2 Windows manual-setup labeling finding was accepted. Accessible
label correction preserves the user's visible button text and prose-free layout.
Targeted review accepted that two-file delta, then a final three-file formatting/
revision-label delta. No unresolved source finding. Ledger: 2 launches (1 failed),
1 initial wave, 2 targeted turns, 2 fix batches; roughly 10 minutes elapsed
(manual estimate), coordinator review/integration around 3 minutes (estimate).
A formatting syntax error was caught by Node checks and corrected before serving.
No extra cumulative review was needed: unchanged initial coverage plus targeted
deltas covers the final implementation. Review is not owner visual approval.

## Limits and next decision

This is a browser review with simulated `--vscode-*` host variables. No real
VS Code extension host was launched or verified, and the owner's private Code
trial was untouched. Arbitrary user themes, OS forced-colors behavior, screen
readers, WebKit/mobile Safari, real 400% browser zoom and physical Windows were
not tested. The 320px viewport is a reflow check, not a claim of actual zoom.
Next.js production component behavior was not re-tested because those files are
unchanged; the local web renderer reuses data and availability functions.

No Java, JavaFX, GitHub authentication, upload, release download or repackaging
occurred. The 0.5.8 candidate and production UI remain unchanged. Signing,
publishing, pushing, merging, deployment and credentials remain outside scope.
The review kit is delivered; production application waits for owner visual review.

Owner approved application to Learn/downloads and the sidebar on 2026-10-13.
The preceding receipt records the earlier review-kit phase; application evidence
is recorded in docs/VERIFICATION.md and ignored .verification/design-applied/.
