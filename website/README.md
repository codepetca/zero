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

Preparation reads release metadata and canonical repository documents, lessons and teaching media. It writes ignored `.generated/content.json` (docs/source), `.generated/release.json` (validated download/update metadata), and `public/generated/` assets, including optional game media from the shared project manifest. Tutorial project ZIPs are no longer generated; tutorial template publication metadata is separate from the five existing example templates. Re-run preparation/restart after changing canonical docs. Builds need the Zero repository sources outside `website/`; no sibling repository is required. The supplied logo paths come from `extension/media/zero.svg`, with the approved purple colour. Lucide SVGs supply navigation, disclosure, download and theme icons.

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
The separate desktop broker supports browser authorization and token renewal
for the reviewed Zero client. It is disabled by default and reuses the existing
server App credentials; it does not persist desktop tokens or share Hub sessions.
See [desktop activation](../docs/DESKTOP-GITHUB-ACTIVATION.md) for the fixed
callback, feature flag and acceptance limits. Native releases remain separate.
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

### ZeroJams discovery

Local development shows **Jams** in the ZeroHub sidebar. The production pilot
uses direct links by default. Set the server-only
`ZERO_JAMS_DISCOVERY_ENABLED=1` to show the sidebar entry in production when
`ZERO_JAMS_PILOT_ENABLED=1` and `ZERO_JAMS_ENABLED=1` are already enabled.
The sidebar setting grants no hosting access. The directory uses the Jam
service's Pro policy to show **Create a jam** to eligible signed-in accounts.

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

Tutorials opens the recovery guide at `/learn`. The selector numbers the visible
lessons 0–12: recovery, Greeting, Coin, Pet including its welcome screen, then
Coin game revisited. Earlier quiz URLs remain accessible to existing links,
but are not in the current selector. Stable URL identifiers do not change with
display numbering. Sidebar selection updates the reading pane and lesson URL.

Website control icons use pinned `lucide-react` SVGs through `components/Icon.tsx`.
Decorative icons inherit text color and remain hidden from assistive technology;
controls retain their accessible labels. Zero branding and native VS Code icons
are separate. The shared preview embeds matching licensed Lucide artwork.

## Searchable API reference

ZeroHub's optional [interest and adoption metrics](../docs/ZEROHUB-METRICS.md)
reuse publication records for component counts and a small Redis REST store for
Play opens. Vercel Marketplace's Upstash integration supplies server-only
`KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. An explicit
`ZERO_HUB_OPENS_REDIS_URL` / `ZERO_HUB_OPENS_REDIS_TOKEN` pair overrides them.
Use only the Free plan with auto-upgrade and Prod Pack off. Vercel previews
always disable this store; `ZERO_HUB_OPENS_DISABLED=1` also disables it.
Without counters, Play and existing feedback still work.
No analytics package or new GitHub App permission is required.

### Automatic ZeroHub app listings

App listings are disabled by default and in hosted previews. For an authorized
environment, apply `website/sql/zerohub-listings.sql` to a dedicated Postgres
database using its owner. Give a separate login role USAGE on the listing
schema and sequence and SELECT, INSERT and UPDATE on its table. Set the
server-only `ZERO_HUB_LISTINGS_DATABASE_URL` to that role's direct PostgreSQL
URL and enable `ZERO_HUB_LISTINGS_ENABLED=1`. The runtime requires verified
TLS. Local development and tests can use Postgres at `127.0.0.1`. Never
put this URL in a public environment variable.

Public discovery uses the existing Codepet Zero GitHub App configuration
(`ZERO_JAMS_APP_ID` and `ZERO_JAMS_PRIVATE_KEY`). The server requests a
short-lived installation token with metadata read permission for one
repository. It checks current ownership, public visibility and whether Pages
is enabled. Public Play links require the expected run marker at a direct
GitHub Pages address. Cards link to the repository if the marker is unavailable
or the project uses a custom domain. Owners can open their verified deployment
from **My Apps**.

The existing Zero GitHub App and ZeroHub browser authentication configuration
verify publishing and management. An editor checks app listing availability before
it sends the publishing receipt and its GitHub access token. The optional server-only
`ZERO_HUB_LISTINGS_PRO_GITHUB_IDS` list grants ten app slots to the
specified verified numeric account IDs. This is a manual pilot grant.
ZeroJams hosting has its own entitlement. If an app slot grant is removed,
existing cards stay visible while the owner trims the queue to the Free limit. Leave the app listings flag off until
the database and both browser and desktop acceptance are ready.

To exercise real transactions, apply the SQL to a disposable local database
and run `node --test website/tests/hub-listings.test.mjs` with
`ZERO_HUB_LISTINGS_TEST_DATABASE` set to its connection URL.

`/docs` presents the complete reference (`/docs/api` redirects there), generated from maintained
`student-template/API.md` tables. The adapter verifies all current public/protected
declarations against source in tests. Categories, exact-name/keyword search,
parameters, examples, source links and Advanced deep links share one page.
The existing theme/navigation and click/keyboard code-copy controls are retained.
Learning explanations live in the relevant tutorials. Setup help and teacher
notes have separate navigation; old guide URLs resolve to their new destinations.
Old API section fragments remain supported.


After `npm run build`, run `npm run audit:bundles` to check emitted route traces.
Run `npm run check:runtime` to execute the emitted download/feed/template handlers
from an isolated copy containing only traced files. It checks feed bytes, hosted
refusal/local receipt downloads, hidden production routes and both template types.
The audit rejects test/build metadata, raw UI/build sources and duplicate public assets in the five
filesystem-reading download/feed/template routes, checks their canonical template
files, and catches large documentation chunks returning to download/feed paths.
Its deduplicated local trace sizes are build evidence, not Vercel billed storage.

### Experimental WorkOS website identity

This source contains an opt-in hosted AuthKit session. It is disabled unless
`ZERO_WORKOS_ENABLED=true` and all required settings pass the source checks in
`lib/workos-config.mjs`. Configure a dedicated WorkOS application with only GitHub
social authentication enabled, its callback at `/zero-account/callback`, its
initiate-login URI at `/zero-account/sign-in`, and a permitted sign-out URI. The
callback rejects missing/non-GitHub authentication methods and impersonation.
Set `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD` (at least 32 characters),
`WORKOS_COOKIE_NAME=zero-workos-session`, `WORKOS_ISSUER` to
`https://api.workos.com/user_management/<client ID>`, and
`NEXT_PUBLIC_WORKOS_REDIRECT_URI` to the exact callback URL. The source permits
the production origin or localhost in development; it rejects a shared cookie
domain. Configure the WorkOS flag only for the production environment: a
preview deployment cannot complete the production-origin callback. Set the
public redirect URI before building, and redeploy after changing environment
variables. WorkOS management API keys are not required for this session.

The Zero account endpoint exposes only the WorkOS user ID. In managed mode,
Hub sign-in starts AuthKit. For Hub, Stars and Jams, set `ZERO_HUB_ORIGIN` to
the exact WorkOS callback origin and configure the existing Hub GitHub App
client ID, client secret and session key. The dedicated WorkOS integration must
return an expiring user access token from the pinned Codepet Zero GitHub App.
The callback checks the App and token owner with GitHub and seals the grant for
the verified WorkOS user and session. It uses GitHub's numeric account ID and
keeps the grant for at most eight hours, ending sooner if the provider token
expires. Each private Hub, Stars and Jams request requires the same active
WorkOS session. Hub and Zero account sign-out clear both browser sessions and
send a valid WorkOS session to the hosted sign-out endpoint.

A GitHub sign-in through WorkOS can establish a Zero account without Hub access
when the provider omits an eligible App grant. Managed mode refuses legacy Hub
cookies, including when its configuration is incomplete. With the flag off,
Hub continues to use the standalone GitHub App flow. The binding lives in the
browser session and does not create a durable account mapping or alter editor
GitHub App authorization. This source is opt-in. Live token delivery from the
pinned App, permissions, hosted session refresh and sign-out remain to be
verified during the production cutover.

For rollback, retain the existing Hub GitHub App callback and secrets, disable
the WorkOS flag, and redeploy. Users with managed sessions must sign in through
the legacy GitHub flow; an untouched, unexpired legacy cookie can become valid
again when managed mode is disabled.
