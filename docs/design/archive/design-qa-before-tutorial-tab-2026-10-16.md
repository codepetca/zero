# Compact Zero sidebar design QA — 2026-10-16

final result: passed

Source visual truth: `/Users/stew/.codex/generated_images/01a13f98-55fc-7471-9038-1198b14d5a98/exec-2051d29b-f561-4f48-bb05-6306be3e0c83.png`.
Implementation: reviewed `e4e9629`, actually installed in the isolated Code QA
profile. Evidence root: `.verification/sidebar-onboarding-20261016/`.

## Comparison evidence and normalization

Opened both artifacts together in `sidebar-full-comparison.png` (full context)
and `sidebar-comparison.png` (readable sidebar crops, also including prior native
layout). Source1487×1058 is an illustrative generated concept, without a known CSS
viewport/density. Ready native screenshot `sidebar-installed.png` is2880×1806,
approximately1440×903CSS at2×. Sidebar crops normalize source395px to300px and
native600px to300CSS pixels. Full context retains aspect ratios at760px height;
editor/window proportions are not treated as pixel-exact design requirements.
Both depict light theme, armorup, main, ordinary Study Java, stopped/ready controls
and collapsed file groups. The real repository name is longer; Resources appears
when its directory exists. Later actual trial captures are1440×900 at1×:
`native-sidebar-final.png`, `native-new-trial-running.png`,
`native-error-problems.png` and `native-empty-sidebar.png`.

## Findings

No actionable P0/P1/P2 visual mismatch in the combined comparisons. Native font,
window chrome and pinned Lucide file icons are intentional host adaptations.

- Typography: the actual host font and size use `--vscode-font-family` and
  `--vscode-font-size` (13px fallback), matching the prior native interface rather
  than copying the generated editor font. Labels remain legible; the long real
  repository wraps without clipping or hiding controls.
- Spacing/layout: one Zero title, paired Run/Stop, visible Clone, account/repository,
  branch, Commit & push, Publish and Browse precede a quiet Files label. The extra
  collapsible Zero row, independent Files view and GitHub/ZeroHub headings are gone.
  The ready file heading is approximately118CSS pixels higher than the prior
  screenshot at the same300CSS sidebar width. This is a screenshot measurement,
  not a general performance claim. Brief runtime feedback remains after actions;
  verbose diagnostics use the bottom Zero Output/Problems panels.
- Colors/tokens: host background, text, link, button, disabled and focus tokens
  remain consistent with native light theme. Isolated production-client fixture
  evidence covers220px high contrast and240px dark at200% text; those are not
  native Windows/theme acceptance or a WCAG certification.
- Asset fidelity: no raster/logo asset is needed. Play/Stop/branch/publish/folder/
  file glyphs use the pinned Lucide library; no custom approximated illustration
  or fake Java artwork was introduced. Native editor Git decorations remain
  available; the custom file list uses simple file/folder glyphs.
- Copy/content: exact Git action labels are Commit & push and Merge to main.
  The real commit review explicitly describes commit-if-needed/current-branch
  push; Publish stays separate. Start tutorial is on empty/welcome and native
  overflow, keeping open-project controls short. Signed-out text names GitHub.

## Interaction evidence and comparison history

The first combined visual comparison used the corrected source and found no
visual blocker; no visual fix iteration was required. Independent source review
had previously found two functional P2s (nested focus reset and lost ninth file
request). One correction batch and targeted review resolved both before visual
acceptance. Production client/bridge regressions pass; actual native create/delete
watcher refresh retained focused Toolkit/App.java. Native Up/Down/Right/Return
navigation, file opening and view hide/show with retained expansion passed.

Actual native fresh private template creation → Clone → separate destination →
Open in New Window → account/origin detection → ordinary Java edit → source error
at15:53 → Show Problems/Output → correction → Run/control checks → Stop passed.
Unchanged Run showed Validated browser build ready and reset app state. Both
owned preview URLs refused connections after Stop. Native New branch and Commit &
push reviews were cancelled; only Main.java remains modified, initial commit and
main retained. Fresh signup/new consent and live push/merge/Pages were not rerun.

## Implementation checklist and residual coverage

- Selected continuous layout, menu/tutorial location, Git labels: verified.
- Keyboard, async refresh, bounded queue/opaque paths: focused checks and native
  interaction verified; complete source review clean at e4e9629.
- Final root459tests458pass/1PowerShellskip; website108/types/build and local
  package/extracted-kit verification pass. Detailed receipts are ignored locally.
- Physical Windows, clean install, native dark/high-contrast and novice/school
  testing remain release acceptance, alongside the held live publication flow.

P3 follow-up: when the repository owner equals the selected account, its repeated
owner text could be shortened while retaining the full destination in review.
This does not clip or block the tested layout. Previous QA is preserved at
`docs/design/archive/design-qa-before-compact-sidebar-2026-10-16.md`.
