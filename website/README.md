# Zero website

Next.js App Router / TypeScript website for the Zero teaching kit and ZeroHub. Home uses the shared app header, Learn Java / Starting from zero., Download Zero (`/downloads`) and Start Learning (`/learn`). Java runs locally in VS Code.

Requires Node.js 22+. From this directory:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev -- --port 3000
```

Preparation reads release metadata and canonical repository documents, lessons and teaching media. It writes ignored `.generated/content.json` and `public/generated/` assets, including optional game media from the shared project manifest. Tutorial project ZIPs are no longer generated; tutorial template publication metadata is separate from the five existing example templates. Re-run preparation/restart after changing canonical docs. Builds need the Zero repository sources outside `website/`; no sibling repository is required. The supplied logo paths come from `extension/media/zero.svg`, with the approved purple colour. Lucide SVGs supply navigation, disclosure, download and theme icons.

## Learning routes

`/learn` opens Lesson0. Lessons0/3/8 require students to create their own repository from the matching empty tutorial template, then clone their own repository. Only verified publication metadata enables Use template; pending templates show explicit unavailable guidance. Later lessons continue the same repository with New branch, edit/Run, Commit & push and Merge to main. Lesson10 reopens Study and Game; Lesson12 retains its optional media-only ZIP. Tutorial project-ZIP links are not accepted. New source behavior is unreleased; published kits keep their original instructions. `/tutorials/[lesson]` renders the maintained lesson Markdown with all sections expanded by default, related docs and Next lesson navigation. Individual sections can still be collapsed, and section fragments open their enclosing disclosure. `/docs` opens the setup guide directly; `/docs/[slug]` shares that reader. Desktop readers have a sidebar; mobile readers have a labeled guide selector. `/examples` and `/examples/[slug]` redirect to the matching ZeroHub example view. Docs and ZeroHub examples share light/dark themes and labeled selectors on narrow screens.

Markdown renders on the server. The browser receives the current route's rendered content and small navigation/folding controllers. Relative file links map to tutorials, guides or the read-only `/source?file=<URL-encoded repository-relative key>` viewer. Unknown, traversal and repeated source query values return 404. Allowed absolute content links include the optional game media ZIP and publication-gated ZeroHub project routes; tutorial project ZIP links are rejected. Requests use an exact key lookup in the prepared snapshot and never read a filesystem path. The build-time allowlist contains regular teaching examples, read-only lesson checkpoints, docs, reader documents, project metadata, LICENSE/README and the two canonical framework Java files. Symlinks are skipped.

## ZeroHub

`/hub` opens the minimal starter for a student's original course project. The
sidebar offers four practice projects and three optional advanced projects;
nineteen intermediate checkpoints stay accessible through their existing URLs.
The narrow-screen selector groups those same choices. Each of the 26 examples shows
actual JavaFX preview images, a description and a complete source download. The
minimal starter and four featured examples offer **Use template**, **Download ZIP**
and their standalone GitHub repository links; the other entries retain **Get
project** and canonical source links. Get project downloads a complete standalone Maven project with
its Main, helpers, framework, resources, pinned wrapper and Run App configuration.
Extract it into a new folder, open it in Zero and Run App; no source splicing is
required. Sidebar selection uses `?kind=example&example=<id>`.
`example=zero-starter` selects the minimal starter, which excludes lessons and
example sources. The prepared snapshot contains a separate `starter` entry and
all 26 `projects`. Guided downloads include a concrete change, README planning and
the actual student-owned repository workflow. `/docs/course-project` distinguishes
Zero's individual Merge to main from GitHub pull request practice. Five public GitHub templates are recorded in `content/project-templates.json` with
verified numeric repository IDs, main commits and trees. Preparation validates the
complete publication snapshot before exposing template links. Empty metadata
retains the source ZIP route; partial or invalid metadata fails preparation.
`node scripts/prepare-project-templates.mjs` from the repository root prepares
fresh explicit source inventories outside parent Git repositories; it never publishes.

Preparation derives these first-party source ZIPs and their size/hash snapshot
from the explicit maintained manifests, validates them against the shared project
archive policy, and writes ignored `public/generated/example-projects/`,
`.generated/example-projects.json` and `dist/example-projects/`. Required preview
PNGs are tracked in `public/example-previews/`; regenerate them on macOS with
`python3 scripts/capture-example-previews.py` after preparation. They are actual
app Scene snapshots, including the two shared-screen started states and a real
mouse stroke for Drawing pad. Capture output/receipts are ignored.

`/hub?kind=game` and `?kind=library` retain community project/library discovery.
Maintained examples are built from this repository; they do not fabricate an
accepted community-registry release or alter native catalog/publication policy.
Community cards show
exact versions, verified GitHub contributor identity, pinned source commits,
optional previews and artifact size/hash details. `?kind=library&id=lib-r12345-health-bar&version=0.1.0`
inspects one exact release without substituting another. Games offer **Download
project** into a separate folder; libraries expose Java usage/API and manual
Maven instructions. Browsing does not install a dependency or run Java.

`/hub/share` explains native Zero **Share game**, **Share library** and **Check
library** commands and official GitHub publication forms. Students use their own
existing game repository with optional `libraries/<name>/` folders. There is no
website OAuth, reservation, folder-push, submission queue or Neon database.
Public publication remains inactive while its operating and checker gates are
unresolved. A local fixture or successful website build does not publish a release.

Read-only `GET /api/sharing/catalog` returns the legacy catalog projection with
optional web receipts removed for existing strict clients. `GET /api/sharing/catalog/web`
returns the enriched catalog used by current discovery and new kits. Both validate
the same canonical immutable snapshot before responding; neither returns registry
request or operational state. Optional Play latest links open a student's hosted
live app in a separate tab. Its stable Pages URL may change content after the exact
source snapshot was shared. Source downloads remain editable Java projects; ZeroHub
stores no compiled copy of the browser app. The server uses
the pure schema from `extension/src/sharing/contracts.js`; include that source
in website builds. Missing configuration, an uninitialized pointer, an invalid
snapshot or an outage produces an honest unavailable state without fallback.

## Download states

A published kit links directly to verified immutable GitHub assets. While the current kit remains local, optional `release/published-kit.json` provides the last verified public kit, starter and VSIX, with their own version labels. Preparation validates published state, exact URLs, sizes and hashes; fallback cannot be newer than the current kit. A missing fallback shows the availability explanation at `/downloads`. Mac setup publication is independent of the ZIP version.

To preview a new local version, package it from the repository root, then:

```sh
ZERO_LOCAL_DOWNLOADS=1 npm run dev -- --port 3000
```

`/download/kit`, `/download/starter` and `/download/extension` verify authored filenames, receipt versions, sizes and SHA-256 against `dist/` on every request. Local Mac setup additionally checks its signed/notarized provenance and unchanged source. Stale, missing or tampered artifacts fail closed. Installer/kit binaries stay out of `public/` and Git; the generated example ZIPs contain editable source projects. Vercel always disables local filesystem downloads. Published assets retain their public links even with the preview flag.

## Hosting and verification

The existing Vercel Root Directory is `website/`, with repository sources outside
that directory included for build preparation. Install/build commands are `npm ci`
and `npm run build`, using Node.js 22.x. Keep `ZERO_LOCAL_DOWNLOADS` unset for
hosted builds. GitHub Releases host existing kit downloads.

The sharing catalog's current pointer lives in the Git CAS ledger at
`registry/state.json` on the public `zero-sharing-registry` branch of
`codepetca/zero`. Immutable Blob objects hold generated JSON snapshots and release
artifacts. The website consumes this pointer; it does not overwrite a Blob
current-pointer object or claim Blob provides compare-and-swap.

Configure `ZERO_SHARING_ARTIFACT_ORIGIN` as the exact HTTPS Blob origin, without
a path, query or fragment. Select exactly one source:

- `ZERO_SHARING_REGISTRY_URL=https://raw.githubusercontent.com/codepetca/zero/zero-sharing-registry/registry/state.json`
  for the canonical Git ledger. No other registry URL is accepted.
- `ZERO_SHARING_CATALOG_URL=<fixed HTTPS immutable JSON snapshot URL>` for a
  direct staging snapshot. This is an alternative, never an outage fallback.

Registry responses are capped at 8 MiB; snapshots at 4 MiB. Both fetches share
one 8-second deadline and reject redirects. The registry pointer must use the
configured artifact origin, a digest-named snapshot path, a valid sequence and
revision. The reader verifies SHA-256 against that path, optional size/hash fields,
the catalog schema and matching registry revision. The browser request has its
own 10-second deadline. Public deployment, artifact publication, branch creation
and resource provisioning require separate authorization; these settings do not
activate the blocked library checker.

Tests cover exact-version selection, separated game/library behavior, fixed
source/origin boundaries, snapshot integrity, bounds, outages, timeouts and kit
download integrity. Typecheck/build verifies packaging. Browser QA remains a
separate check for mobile reflow, keyboard/focus and accessible states; builds
and fixtures do not prove hosted artifact delivery, public publication or physical
Windows setup.

Tutorials now opens lesson 0 directly at `/learn`, with all thirteen lessons in
the desktop sidebar and a lesson selector on narrow screens. Sidebar selection
updates the reading pane and bookmarkable lesson URL; there is no overview landing.
The tutorial reader shares the approved appearance controls with Downloads.

Website control icons use pinned `lucide-react` SVGs through `components/Icon.tsx`.
Decorative icons inherit text color and remain hidden from assistive technology;
controls retain their accessible labels. Zero branding and native VS Code icons
are separate. The shared preview embeds matching licensed Lucide artwork.

## Searchable API reference

`/docs` and `/docs/api` share the complete reference, generated from maintained
`student-template/API.md` tables. The adapter verifies all current public/protected
declarations against source in tests. Categories, exact-name/keyword search,
parameters, examples, source links and Advanced deep links share one page.
The existing theme/navigation and click/keyboard code-copy controls are retained.
Longer guidance lives at `/docs/app-guide`; setup and other guides stay available
from the sidebar. Old API section fragments remain supported.
