# Zero website

Next.js App Router / TypeScript website for the Zero teaching kit and ZeroHub. Home uses the shared app header, Learn Java / Starting from zero., Download Zero (`/downloads`) and Start Learning (`/learn`). Zero checks and compiles ordinary Java locally, then opens the app in the browser.

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

`/learn` opens Lesson0. Lessons0/3/8 require students to create their own repository from the matching empty tutorial template, then clone their own repository through **Project → Clone from GitHub… → Clone here**. The Clone location chooser defaults to `~/Zero Projects` and accepts another folder; an already-cloned Zero folder opens through **Project → Open local project…**. Newer VS Code opens a new window automatically; the 1.95 fallback may ask for Open in New Window. Only verified publication metadata enables Use template; pending templates show explicit unavailable guidance. The starting pages show a compact template action and Setup link to `/help/setup#start-here`; continuing lessons omit generic setup cards. The full New branch, edit/Run, Commit & push and Merge to main workflow stays in the setup guide. Lesson10 reopens Study and Game; Lesson12 retains its optional media-only ZIP. Tutorial project-ZIP links are not accepted. New source behavior is unreleased; published kits keep their original instructions. `/tutorials/[lesson]` renders the maintained lesson Markdown as visible numbered instructions and copyable code, with related docs and Next lesson navigation. Tutorials omit the short summary, Done checkpoint and Code and explanation disclosure. General documentation sections retain their disclosures and deep-link behavior. `/docs` opens the searchable Zero API, with method names visible while their details scroll. Tutorials are the single learning path; startup, appearance, objects and screen flow are explained in the relevant lessons. `/help/setup` and `/help/course-project` have their own two-entry Help navigation; `/teachers` and `/teachers/pilot` form a separate teacher area. Maintainer records stay in repository documentation. Old `/docs/[slug]` URLs and their chapter bookmarks resolve through the shared document destination map. Desktop readers have a sidebar; mobile readers have a labeled selector. `/examples` and `/examples/[slug]` redirect to Tutorials. Docs and ZeroHub use the shared light/dark themes.

Markdown renders on the server. The browser receives the current route's rendered content and small navigation/folding controllers. Relative file links map to tutorials, guides or the read-only `/source?file=<URL-encoded repository-relative key>` viewer. Unknown, traversal and repeated source query values return 404. Allowed absolute content links include the optional game media ZIP and GitHub project repositories; tutorial project ZIP links are rejected. Requests use an exact key lookup in the prepared snapshot and never read a filesystem path. The build-time allowlist contains regular teaching examples, read-only lesson checkpoints, docs, reader documents, project metadata, LICENSE/README and the two canonical framework Java files. Symlinks are skipped.

## ZeroHub

`/hub` opens Projects, with Projects/Libraries navigation and a separate Share
your work action. The starter/example collection and its generated project ZIPs
are retired. All legacy example routes redirect to Tutorials. Supporting docs
link to the relevant lessons; readable source remains available for reference.
The internal example/template generators are maintainer tools, not public pages.

`content/projects.json` records maintained first-party projects independently of
community admission. Drawing Pad points to the anonymously verified public
`codepetca/zero-drawing-pad` commit and an actual square screenshot of that source
running in the browser. It stays visible during a community catalog outage and
appears in project searches. Its screenshot opens its verified GitHub Pages app. This entry does not manufacture an accepted community release.

Community discovery shows only each project's latest available release. Exact
release links retain their original version and withdrawn status. Cards use tiny
descriptions and plain titles; screenshots open Play and versions link to GitHub. No controls section,
source-project download or release internals appear. Libraries keep usage and
manual Maven setup in a disclosure. New game submissions require a valid square
PNG under the reviewed publisher policy; existing accepted releases remain valid.

`/hub/share` explains native sharing and the official GitHub request forms.
ZeroHub browser sessions do not receive desktop publisher credentials. An optional, short-lived GitHub
App session enables inline repository stars; browsing and playing stay public.
It uses the same Codepet App as native Zero, with separate browser credentials.
The public [Codepet Zero App](https://github.com/apps/codepet-zero) is registered
under `codepetca`, and its public IDs are pinned in source. Browser sign-in remains
disabled without the required server credentials. Registration did not provision
server secrets or user tokens; installation, live acceptance, production activation
and an authorized native release remain pending.
Local source also includes a separate desktop authorization broker at
`/api/desktop/github/*`, disabled by default. It exchanges and renews desktop
tokens using the server-held App secret, with PKCE and a temporary IPv4 return.
It does not persist desktop tokens or reuse ZeroHub browser sessions.
`ZERO_DESKTOP_GITHUB_ENABLED=1`, matching server credentials, the exact registered
`https://zero.codepet.ca/api/desktop/github/callback`, and separately approved
deployment/activation are required. See [desktop activation](../docs/DEVELOPMENT.md#desktop-browser-sign-in-activation-separate-from-publication).
The shared App has selected-repository development permissions; ordinary browser
tokens are not a GitHub-enforced star-only boundary. See the
[identity plan](../docs/ZERO-IDENTITY-PLAN.md) for that owner-selected tradeoff.
See [ZeroHub feedback](../docs/ZEROHUB-FEEDBACK.md) for the exact permissions,
server environment and activation procedure. Public checks and counts are bounded
and cached; issue reports open on GitHub for the user to submit.
The catalog APIs validate the
canonical snapshot; the legacy endpoint strips optional web receipts, while
`/api/sharing/catalog/web` exposes checked Play links. Those links open the
author's mutable hosted app in a new tab. Missing configuration or an outage
shows an honest shared-catalog error and retry; maintained projects still render.

## Download states

A published kit links directly to verified immutable GitHub assets. While the current kit remains local, optional `release/published-kit.json` provides the last verified public kit, starter and VSIX, with their own version labels. Preparation validates published state, exact URLs, sizes and hashes; fallback cannot be newer than the current kit. A missing fallback shows the availability explanation at `/downloads`. Mac setup publication is independent of the ZIP version.

To preview a new local version, package it from the repository root, then:

```sh
ZERO_LOCAL_DOWNLOADS=1 npm run dev -- --port 3000
```

`/download/kit`, `/download/starter` and `/download/extension` verify authored filenames, receipt versions, sizes and SHA-256 against `dist/` on every request. Local Mac setup additionally checks its signed/notarized provenance and unchanged source. Stale, missing or tampered artifacts fail closed. Installer/kit binaries stay out of `public/` and Git; retired example ZIPs are removed during preparation. Vercel always disables local filesystem downloads. Published assets retain their public links even with the preview flag.

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

`/docs` presents the complete reference (`/docs/api` redirects there), generated from maintained
`student-template/API.md` tables. The adapter verifies all current public/protected
declarations against source in tests. Categories, exact-name/keyword search,
parameters, examples, source links and Advanced deep links share one page.
The existing theme/navigation and click/keyboard code-copy controls are retained.
Learning explanations live in the relevant tutorials. Setup help and teacher
notes have separate navigation; old guide URLs resolve to their new destinations.
Old API section fragments remain supported.
