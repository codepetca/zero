# Minimal Zero sidebar delivery

Owner approved the prototype and authorized separate extension and website PRs
and merges on 2026-10-13. Initial base: main 5c4a3fd; rebased onto merged website PR45 (568d2d9); published releases remain immutable.

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

Independent initial Sol/medium review: clean, complete 16-file scope and relevant
callers at f6af241; installed VS Code source corroborates supported single-view
container behavior, with native proof still absent. Website PR45 independently
reviewed, green CI, merged568d2d9; automatic production deployment7055923363 is
successful. Browser verified live starter route/template/clone controls before
sidebar integration. Additive design table conflict resolved preserving both
approvals; 16 integrated extension checks, 78 website tests and typecheck passed.
Related course/Hub/generated README wording now says New branch and explains the
older-kit Start a change label. Public template repositories are not rewritten.
One integration correction batch; final delta review/CI receipt in coordinator
handoff after merge. Requested Sol/medium, effective telemetry/time/tokens unknown.
Account weekly19%used is not attributable effort; storage322GBhealthy, no cleanup.
