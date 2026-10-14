# Minimal Zero sidebar delivery

Owner approved the prototype and authorized separate extension and website PRs
and merges on 2026-10-13. Base: main 5c4a3fd; published releases remain immutable.

One Zero view replaces Your app/Files: native Explorer handles files. Run/Stop
stays at the top, with no internal collapse control and no idle Ready label.
GitHub shows Sign in or username; signed-in repo actions hold Copy repository
link. New branch/Finish change is visible beside the branch, with reviewed upload
and simulation unchanged. Local practice retains its no-sharing guard. ZeroHub
opens complete website projects/templates or native exact-version libraries;
Share project retains existing review/sign-in/policy guards. Native overflow
contains only Tutorials and Setup help. Existing command IDs remain compatible;
Start project and advanced sharing commands remain in the Command Palette.
Explicit Tutorials opens the hosted guide for lessonless templates; activation
and Run do not use that fallback or mark it as a bundled preview.

Checks: 16 focused tests; npm run check; full npm test 259 pass, 1 platform skip,
0 failures; syntax/design drift/diff. Subsequent project-browser/visibility change
reran affected focused checks. No release/framework/version/package rebuild.
Browser source-renderer fixture: light at 320px, dark error at actual 240px (host
minimum despite a requested 200px), no page overflow; keyboard Tab skips disabled
Stop and reaches Sign in. Source tests cover connected/signed-out account escaping,
New branch/Finish serialization/drift, simulation, native task errors and tutorial
fallback. Logs/screenshots remain ignored in .verification/sidebar/.

Native Code CUA timed out; retry inventory also timed out/reset. Actual native
single-view header/collapse, light/dark/high-contrast and keyboard behavior remain
unverified; browser fixture colors/controls do not establish those results.
Supported single-view contribution removes the internal accordion; users retain
VS Code's view rearrangement/hiding controls. Windows/student live GitHub flows
remain unverified. Frozen 0.5.8 and newer main release manifests are unchanged.

Independent review and exact-head CI are required before merge; final receipt
will be recorded in the coordinator handoff after delivery.
