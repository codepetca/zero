# Student project explorer

Owner direction, 2026-10-26: replace beginner-facing filesystem clutter with a
small native Zero project view. This is the current explorer phase of the wider
framework goal. The goal tool refused a new objective because that earlier goal
is unfinished; preserve its history rather than falsely marking it complete.
Source PR/push/merge, PR integration, hosted publication, deployments and releases
remain separate. Existing Git recovery work and public student projects stay intact.

## Student experience

Creation uses the native Project header’s New… (+) menu and tree context menus.
Only New stays inline; Refresh, Show All Project Files and Collapse All live in
Project’s three-dot menu.
ZeroHub lives in Project’s overflow; neither control appears in the student
controls panel (owner refinement,2026-10-26). New opens an anchored dropdown,
uses the selected file’s parent or selected folder, and names destinations using
the visible java/resources/package hierarchy. File right-click menus also offer
Rename file; this changes the basename only and explicitly leaves Java class
names/references for the student to update. No cross-folder moves or automatic
Java refactor engine are included.

java and resources are always visible. java presents Main, student classes and Java
packages; resources maps to the app's real resource directory. Libraries appears only
when a project has an added or authored component. Added libraries show their exact
version; authored components show whether local code or a published pin is active.
Component details expose existing development, check and sharing actions only when
needed. Framework/build files remain reachable through Show all project files.
Other authored project files are grouped separately and never silently discarded.

Ordinary helpers remain app code. A Java package organizes classes; a ZeroHub
library distributes a reusable component. Package creation does not publish or
extract a library. Add a dependency first, then import its documented class in
Java; show a copyable exact import/example when authoritative metadata is available.
Do not invent an API if offline or metadata is unavailable.

Use supported native TreeView APIs and the existing controls renderer. Keep editors,
Problems, Source Control, file previews and full Explorer. No new central storage,
framework upgrade or mandatory language-server dependency. No automatic Java move/
rename rewriting, editable forks, automatic dependency updates or new publication flow.

## Delivery and acceptance

| Phase | Deliverable | Acceptance |
| --- | --- | --- |
| 1 | Native java/resources tree, conditional Libraries, other authored files and full Explorer | Source roots are simple; exact core files hidden without hiding student zero.contrib; project switches/external edits refresh; no file access lost |
| 2 | New package and selected-package New class/file/folder | Matching Java declarations/directories; default Main-adjacent creation preserved; source boundaries, symlinks, collisions and stale roots refused |
| 3 | Selected app/component asset destinations | Correct classpath-relative strings, namespaced library resources, cancellation/keep-both/skip and no-overwrite guards retained |
| 4 | Contextual library details/imports/examples and existing actions | Exact active version/mode is visible; source inspection cannot silently modify installed dependency; no network merely expanding tree; same checker/publication gates |
| 5 | Native student walkthroughs and scoped Java/WebFX proof | Beginner app, packaged game/assets and local component work; actual compile-error recovery/full-Explorer return; native and browser target checked |
| 6 | Independent review/docs and owner visual review | All required checks and reviewed source; concrete light/dark/keyboard host proposal ready; default replacement only after required owner review |

## Ownership

Coordinator owns plan, extension integration, native tree/manifest, Mac acceptance,
review and final handoff. Sol6.1/high workers own file-actions/file-targets, assets,
and the read-only explorer model respectively; each has distinct tests and files.
Workers do not commit, change branches, publish or delegate. Requested model/effort
recorded; effective model/tokens are unknown unless exposed. Start usage3% weekly
used, storage224.9GB available; account readings are not task cost.

## Local rollout

The working switchable preview and requested menu/location/rename refinements
were shown to the owner. The owner’s continuation on2026-10-26 advances local
adoption: Student Explorer becomes the default, with explicit Use Standard
Explorer / Use Student Explorer workspace switches. Preserve existing Standard
Explorer choices and open editors. Publication remains separately authorized.

Status: phases1–5 and independent review pass through e8747259; reviewed native
light/dark/keyboard evidence and bounded platform limits are in docs/EVIDENCE.md.
Phase6 owner review is accepted for this local adoption. Source0aace0a0 completes
the local default. Fresh-workspace default, persisted standard choice and full
Explorer/Zero return pass in the native Mac host; existing-workspace one-time
introduction and editor preservation also have focused regression coverage. No source
publication, account changes or release follows from that acceptance.

Continuation orchestration receipt (2026-10-26): first GPT-6.1 Sol/high worker
launch failed at capacity without edits. GPT-6 Sol/high workers delivered model
hardening, an ignored portability fixture and selected library/reference integration;
coordinator inspected and tested delivery without conflicts. Four independent
reviewer turns, two fix batches, clean final source. Effective model/tokens and
individual worker elapsed time unknown. Startup allowance96% remaining; later93%
remaining is account-wide, not task cost. Storage227GB healthy. Detailed logs,
fixture scripts and native screenshots are ignored under
`.verification/student-explorer`; docs/EVIDENCE.md records exact scope and limits.
