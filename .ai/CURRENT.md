# Run dropdown — local implementation

Owner requested a Run dropdown with Publish app on 2026-10-20. Implementation is
isolated in the run-publish-menu worktree, based on main 6b46df5e / Mac 0.5.28.
The primary Run/Stop path stays native; an adjacent arrow opens Publish app for
ready connected projects. It is disabled while running/stopping. Existing guarded
publishing, repository-menu/palette actions and sign-in remain unchanged.

Shared anchored-menu code serves Run and Files with keyboard navigation, Escape,
Tab, outside dismissal, mutual exclusion and focus restoration. Status-only
updates preserve an open menu; changed controls dismiss it and fall back to Stop
when the arrow becomes disabled. Local Run remains available signed out. Setup
help keeps its plain Run test button.

All 78 affected tests, root configuration and whitespace checks pass. Independent
Sol/medium review of source 4c3ceff9 covered the complete 13-file diff and immediate
callers, with no findings. The following delivery-evidence edit changes no code. Actual renderer in
the safe browser fixture was checked in light/dark at 240px and a 200px iframe,
including 200% text, keyboard opening/Escape/Tab, Publish dispatch and focus return.
No Java or publication runs in this fixture. Real VS Code/native OS and live
GitHub publishing are not retested by this UI change. Screenshots/logs and final
independent review receipt are in ignored .verification/run-publish-menu.

No push, merge or installer publication is authorized for this new change yet.
The published Mac 0.5.28 and immutable release metadata retain their versions.
Original primary-checkout funding work, projects and credentials are preserved.
