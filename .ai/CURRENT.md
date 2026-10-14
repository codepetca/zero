# Current state — centered Zero preparation UI

Updated2026-10-14. Owner asked preparation modal content centered with progress
below text and clarification of installation timing. Local branch
codex/center-zero-preparation; sourcefixf2b7791 uses a centered vertical AppKit
stack that collapses hidden controls. Native/fake/AppKit250 assertions passed;
actual preparing/progress/error previews inspected. Independent requested
GPT-6-Luna/medium bounded review passed fixed275e409..f2b7791, no blockers,
under2min; effective model telemetry unavailable. Checks reused, no reviewer edits.

Dragging into Applications copies Zero.app only. Launching Zero first prepares
~/Zero and verified private Java/editor support; later launches compare owned
files and readiness, repair once when needed, then restore saved isolated editor.
The setup runtime is unchanged by this UI fix. New source is local, not in the
published13DMG; published artifact bytes remain immutable. Minimal centered DMG
layout is still a visual mockup, most recent image exec-82ccc10b-f29d-41c3-911e-ecea7a90ce8e.png
under /Users/stew/.codex/generated_images/01a13b1e-3b3d-7f90-9ed4-dceba4d9c613/.
No new installer build/signing/notarization/publication or credentials changes
performed for this UI correction. Native previews/logs retained in ignored
.verification/modal-layout/. Primary funding checkout untouched. Continued owner
smoke testing; any future native release needs a new version and exact-byte gates.

Previous completed13release/production verification: see docs/EVIDENCE.md,
PR56/57; built1c02dc6, sealedprep0d2bc64, deployment7075524218/merge638b76d.
Published Windowskit10 remains unchanged. Fresh-machine/quarantineUI/macOS12/
Intel/physicalWindows limits remain. No goal/chat/automation created.
