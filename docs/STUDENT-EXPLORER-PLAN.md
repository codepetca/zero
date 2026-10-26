# Student project explorer

Owner direction, 2026-10-26: replace beginner-facing filesystem clutter with a
small native Zero project view. This is the current explorer phase of the wider
framework goal. The goal tool refused a new objective because that earlier goal
is unfinished; preserve its history rather than falsely marking it complete.
Source PR/push/merge, PR integration, hosted publication, deployments and releases
remain separate. Existing Git recovery work and public student projects stay intact.

## Student experience

Code and Assets are always visible. Code presents Main, student classes and Java
packages; Assets maps to the app's real resource directory. Libraries appears only
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
| 1 | Native Code/Assets tree, conditional Libraries, other authored files and full Explorer | Source roots are simple; exact core files hidden without hiding student zero.contrib; project switches/external edits refresh; no file access lost |
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

First deliver a switchable Preview Student Explorer in Zero Dev, using current
native themes and controls. Preserve the existing Explorer as the default until
the owner sees and accepts the concrete native proposal required by AGENTS.md.
The preview must be fully functional before asking for that final review. A visual
acceptance gate does not stop backend implementation or independent testing.

Status: continuation owns isolated `student-explorer/zero` from exact local
handoff b03ecdaa. Native preview/controller/manifest and selected library reference
integration are implemented locally. Standard Explorer remains default. Focused
162 checks, configuration/syntax check, Zero Dev smoke and scoped package/asset/
local-component native compile plus real WebFX export pass. Real Mac package/class
creation and source-linked compiler-error recovery are in progress; browser play,
independent review and concrete owner visual review remain required.

Continuation orchestration receipt (2026-10-26): GPT-6.1 Sol/high model-hardening
launch failed at capacity without edits; GPT-6 Sol/high completed the bounded
model correction and a later ignored portability fixture; separate GPT-6 Sol/high
worker completed sharing-editor contextual actions/reference guards (48 focused
checks). Coordinator inspected the diffs and integrated them without conflicts.
Requested configurations recorded; effective model/tokens are unknown. Startup
weekly allowance 96% remaining and storage 227GB healthy; account usage is not
task cost. The broad root suite was stopped after discovering it repeated the
handoff-excluded Git recovery matrix; no full-suite pass is claimed. Detailed
logs and the native preview are ignored under `.verification/student-explorer`.
