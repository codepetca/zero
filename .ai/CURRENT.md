# Windows manual fallback and centered downloads — 2026-10-19

Owner authorized publishing the exact ZIP embedded in Windows0.5.21, adding
Manual setup (ZIP) beside the unsigned installer, and fixing landing centering.
Implementation6edda2b starts from main57741ca. No installer/runtime rebuild,
credential change or old release mutation. Original funding checkout preserved.

The manual prerelease windows-manual-v0.5.21 has one zero-bootstrap.zip;
authenticated draft and anonymous public size/SHA256 match the embedded kit.
Optional strict manualSetup metadata ties its link to the current preview;
a signed installer suppresses that older preview link. Windows updates stay off.

Home/Downloads constrain the section and controls to340px; old desktop offset
was-40.375px and new button centers match the viewport at1440/390/320px.
157website tests/typecheck/build and Chromium layout/focus/200%text/dark checks
pass. Sol/medium complete review at6edda2b has no blockers;13focused tests pass.
Metadata PR/CI/merge and live-page verification follow the normal release gates.
Evidence: docs/EVIDENCE.md and ignored .verification/windows-manual-download/.
Actual Windows installation and other browser/device coverage remain untested.
