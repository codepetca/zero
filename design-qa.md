# Tutorial option 2 design QA — 2026-10-16

final result: passed

Source visual truth:
`/Users/stew/.codex/generated_images/01a13f98-55fc-7471-9038-1198b14d5a98/exec-56391a42-720e-4cfa-8dc0-dd616877e087.png`.
Implementation: installed source c89b6ef, actual native Zero editor, evidence root
`.verification/tutorial-browser-20261016/`, `native-final-tutorial.png`.

## Comparison evidence and normalization

Source 1586×992 is a generated concept without known CSS density. Native capture
1440×900 is 1×, light theme, Study lesson 3, Main open beside Tutorials and app
stopped. Both use the same overall composition and lesson activity. Combined
`tutorial-full-comparison.png` retains aspect ratios and normalizes to 850px high.
`tutorial-pane-comparison.png` combines readable tutorial-region crops. Both were
opened and inspected together before this report. This is implementation of the
selected layout using canonical course content, not pixel-exact generated prose.

## Findings

No actionable P0/P1/P2 mismatch for the selected layout and authorized production
adaptation. The source's abbreviated invented lesson text and sidebar predate the
canonical course content and newer owner-approved repository menu.

- Fonts/typography: native VS Code family/size and monospace Java remain intact.
  Tutorial title, task heading, body and optional sections have clear hierarchy.
  The actual lesson uses sentence case rather than the concept's spaced uppercase
  eyebrow. Native editor long lines scroll normally; source remains readable.
- Spacing/layout rhythm: compact sidebar, ordinary Java and a separate Tutorials
  editor group match the selected composition. Real lesson includes its canonical
  target illustration above three tasks, so navigation follows below the first
  viewport. Tasks and completion criterion fit; explanation stays collapsed.
  This is intentional preservation of existing curriculum, not missing controls.
- Colors/tokens: light native theme, neutral reading background, host link/focus
  colors and restrained borders match the editor. Host-selected blue replaces
  concept-specific button rendering. No forced web font or theme overrides.
- Image quality: the existing canonical SVG target is sharp, with correct question,
  input, Check and feedback. It is instructional content, not a replacement for
  an asset in the concept. Host icons use existing pinned icons/native chrome.
  No custom decorative raster assets or imitation editor artwork were added.
- Copy/content: exact canonical lesson title is “A tiny quiz”; its three tasks,
  Done criterion and linked explanation/source replace illustrative mock wording.
  “Check your work” was not turned into an unimplemented grading promise.
  Open in browser is explicit. Clone/New branch now live in the repository menu
  under the owner's later sidebar decision.

## Interaction evidence and comparison history

Final layout passed native Mac acceptance: Java Group 1; Tutorials and Zero App
in Group 2. The initial focus-based placement failed native acceptance and was
replaced by an explicit root/column contract before this final capture. Reload
restoration was added and actually tested: lesson 4, expanded explanation and
scroll position remained. Native Move into New Window and move back passed.

Copy code → paste/save ordinary Java → Run → Chrome wrong/right answer → Stop →
cached rerun passed. Current hosted lesson opened in Chrome. Browser Stop removes
the iframe; final Chrome console has no warnings/errors. Screenshot proof:
`chrome-final-correct.png`, `chrome-stopped.png`, `tutorial-restored-final.png`.
No visual fix was made after the combined final comparison; no unresolved visual
iteration remains. Earlier compact-sidebar QA is preserved in
[the archive](docs/design/archive/design-qa-before-tutorial-tab-2026-10-16.md).

## Implementation checklist and residual coverage

- Selected layout, native lifecycle, lesson/app browser actions: verified.
- Canonical content, root isolation, allowlists, preview snapshot/teardown: tested.
- Final root 498 pass / one runtime skip; final delta 36 pass; website 108 pass.
- Physical Windows, native dark/high contrast, school/novice acceptance remain.
- Hosted website still needs release-aligned instructions. No release or live
  publication has been performed. Final Git/Pages/ZeroHub acceptance remains.

P3 follow-up: compare lesson density with students at smaller laptop heights;
the canonical illustration increases scrolling relative to the concept.

## Installed 0.5.18 Project menu addendum — 2026-10-16

Source3bf5304, actual Mac light-theme screenshot
`.verification/release-readiness-20261016/native-study-front.png` was inspected.
The native window was fitted after a display change: all controls and both editor
groups are visible, with ordinary Java left and canonical Study lesson3 right.
A narrow sidebar stacks Run/Stop and wraps the long trial repository name; native
scrolling, fonts, input and menu behavior remain intact. No new decorative or
stylesheet changes were made to the selected tutorial layout. Current menus and
Clone location were inspected in native screenshots; Open local/Run/Chrome/Stop
interaction evidence is in native-combined-acceptance.json.

The full combined suite now passes510/one runtime skip and website109/types/build.
Remaining guide wording mismatch is explicitly held for correction/review. Dark/
high-contrast, physical Windows, smaller student devices and novice usability are
not newly established by this addendum. No fresh visual comparison or WCAG claim.
