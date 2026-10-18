# Automatic browser game fit — local acceptance, 2026-10-18

Owner requested planning and orchestration of shared automatic phone sizing and
logical touch mapping. Implementation is complete locally on
`codex/browser-mobile-scaling` in the student-friction worktree, based on
main `2a55f789`. Reviewed implementation head is
`c49b32fbc77d10921d8ba2292a1d41c4f72fe821`.

Browser GameApp views fit both axes, preserve aspect ratio and Java canvas
coordinates, center without upscaling, and include padding/ordinary controls.
Primary touch maps to mouse input; extra contacts, cancellation, focus changes
and resize have regression coverage. Ordinary App/native helpers are unchanged.
Students still choose readable text, touch targets and keyboard alternatives.

Acceptance: check passes; web tests157/157 and current adapter8/8; six real
WebFX/GWT fixtures; Chrome desktop56/56 and phone-sized136/136 assertions.
Unchanged Grove Guard passes real touch placement/start/pause/restart at390x844
and740x320, with14source/resource hashes preserved. Initial Sol/high review,
two targeted input reviews and final viewport integration review are clear.
Four correction batches used; no further review/fix loop is authorized by that
budget. Any new blocker needs the documented human checkpoint.

No push, PR, merge, new installer or game publication was performed. Next delivery
needs owner-authorized PR/CI/merge, then an updated client and selected game
rebuild/republish. Physical phones, Safari/other engines and interactive Windows
are unverified. Native computer use reported a locked Mac; no lock bypass.

Details: docs/EVIDENCE.md and ignored
`.verification/mobile-canvas/{plan.json,receipt.json}`. Preserve source snapshots,
logs, screenshots, caches, profiles, registry backups and unrelated worktrees.
Previous Flap Motion acceptance remains recorded in EVIDENCE; operator policy and
published0.5.19 bytes stay pinned. Default public Projects remain Drawing Pad and
Grove Guard; Sky Hop stays withdrawn. No task, goal or automation was created.
