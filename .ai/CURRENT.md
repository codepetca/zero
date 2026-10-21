# Mac update relaunch correction — 0.5.34 source

Owner authorized fix, merge and publication. Base main51fb5700 is published Mac33.
Primary dirty education-funding checkout is preserved; coordinator owns this
managed update-relaunch worktree. Native worker delivered four bounded files;
coordinator owns extension reload, runtime marker, integration and release.

Manual Install and Relaunch now returns control to Sparkle, retaining its
continuation only while existing setup/helper/modal work finishes. New setup is
blocked during installation; existing launch may finish. Silent automatic
installation on quit still does not reopen the app.

After verified native readiness, atomic private editor/update-ready.json records
only schema/version/request UUID. Loaded Zero34+ in that isolated Mac profile
reloads its own idle window with the native Reload Window command. Running apps
and Zero operations defer reload; ordinary profiles and student files stay separate.
An actual isolated Code34→35 fixture loaded the new extension automatically and
preserved an unsaved untitled document's exact text and dirty state. QA-only
telemetry and synthetic marker were used; native publication has separate tests.

Native harness319 assertions pass; affected JS/release checks27pass/1skip. Pinned
Sparkle signing/load/tamper check passed. One old native event-loop test used a
fixed20ms delay; it now pumps until the queued callback completes. First website
run missed dependencies; installed pinned dependencies before final rerun.
Real signed/notarized manual Sparkle fixture is running. Source review, exact-head
CI, signed production build/notary, candidate review, source merge, public asset,
feed promotion and live verification remain. Prior Mac33 feed/download snapshots
stay pinned until verified34 bytes are public.

Important transition: already-installed33 and earlier updaters keep their old
handoff; this first upgrade needs one manual Zero reopen/editor reload. Later
updates from34 use the corrected behavior. Windows21/general kit17 unchanged.
Receipts: .verification/update-relaunch. Preserve all useful ignored receipts and
sealed candidate to primary .verification/update-relaunch-0.5.34 before retirement.
