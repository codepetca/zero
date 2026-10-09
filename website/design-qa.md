# Design QA — passed

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
