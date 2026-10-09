# Learning website design QA — passed

2026-10-09. Approved compact references: `../docs/design/learning-hub-reference.png`
and `learning-lesson-reference.png`. Next.js port of the accepted prototype.

## Evidence and normalization

In-app browser production build at CSS viewport1487×1058; both reference and
rendered PNGs1487×1058. Full and focused side-by-side hub and lesson comparisons
inspected in ignored `.verification/learning-site/comparison-{hub,lesson}-{full,focused}.jpg`.
Mobile390×844 and tablet834×1112 captures inspected; no horizontal overflow.

## Five surfaces and intentional differences

System sans typography, bold navy titles, muted summaries and purple actions
match the approved reference. Hub columns, reader width, whitespace, divider
rows and closed sections match. Existing Zero SVG and small icons retained.
Copy matches the accepted short summaries and section titles. Published download
availability stays below the learning hub. Mobile reader uses an accessible
native lesson/guide selector; desktop retains the lesson sidebar. These preserve
the compact navigation while connecting actual maintained content.
No unresolved visual blocker. Prior minimal landing remains intact.

## Interaction checks

Actual landing Learn more→hub→lesson; one section, Expand all/Collapse all,
next lesson reset, related API fragment reveal, example instructions and Java
source links pass. Mobile menu and lesson selection pass. Keyboard Enter opens
summary. All18 tutorial/doc pages have sections closed, unique IDs and no desktop
overflow. Invalid source/path/repeated-query and missing routes return404.
No browser warnings/errors observed. Source lookup uses build-time allowlisted
text only. Public production verification follows reviewed PR integration.

## Earlier minimal landing QA


2026-10-09. Reference: `../docs/design/selected-landing.png`. Implemented in
Next.js using the approved system font and existing Zero brand asset.

## Evidence and normalization

Codex in-app browser, CSS viewport 1487×1058, DPR 1; source and rendered capture
both 1487×1058. Full and focused side-by-side comparisons inspected together:
`../.verification/website/comparison-full.jpg` and `comparison-hero.jpg`.
Final screenshot `landing-desktop-final.jpg`; mobile 390×844 screenshot
`landing-mobile.jpg`. Evidence is local and ignored, not a release asset.
Initial temporary browser density/viewport mismatch was corrected before judgment.

## Five surfaces

- Typography: large bold lowercase wordmark, readable supporting sentence,
  native system sans; no font fetch. System rendering differs slightly from mock.
- Layout: centered group, generous white space, adjacent desktop buttons,
  no navigation/footer/preview/steps on landing. Mobile sentence wraps and buttons stack.
- Color: approved white/navy/muted/purple/outline tokens; visible purple focus.
- Assets: existing supplied Zero circle/slash SVG, intentionally replacing the
  mock's generated mark per approved design instructions. Bootstrap download icon.
- Copy: exact approved sentence and both action labels. Setup belongs on Learn.

## Mismatch history

No P0/P1 visual issues. P2 desktop paragraph/button group was 24px too low:
reduced heading-to-copy margin and adjusted group offset. Final comparison passes.
Development indicator disabled so local preview retains the minimal surface.
Intentional font/brand deviations above are approved design choices.

## Interaction checks

Learn more → Learn → Community and API reference verified in the browser.
Local Download Zero saved the actual ZIP; checksum compared with dist receipt.
Production without preview flag explains unpublished availability.
Mobile landing/Learn/Community do not overflow horizontally; landing targets
are about 250×60px. Keyboard Tab shows a 3px purple focus outline.
No browser warnings/errors observed. Public release and Vercel/DNS remain pending.

Independent review caught a P2 section-link defect on supporting docs. Fixed
heading IDs and URL fragments; the browser now follows exercises →
`/docs/starter#try-an-example` and places Try an example at the viewport top.
