# Zero website

Next.js App Router / TypeScript website for the Zero teaching kit and ZeroHub. The landing page keeps the wordmark, one sentence, Download Zero and Learn more. Java runs locally in VS Code.

Requires Node.js 22+. From this directory:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev -- --port 3000
```

Preparation reads release metadata and canonical repository documents, lessons and teaching media. It writes ignored `.generated/content.json` and `public/generated/` assets. Re-run preparation/restart after changing canonical docs. Builds need the Zero repository sources outside `website/`; no sibling repository is required. The supplied logo paths come from `extension/media/zero.svg`, with the approved purple colour. Bootstrap Icons supply navigation, disclosure and download icons.

## Learning routes

`/learn` lists thirteen lessons (0–12), docs, examples and a ZeroHub link. `/tutorials/[lesson]` renders the maintained lesson Markdown with collapsed sections, Expand all / Collapse all, related docs and previous/next navigation. Section fragments open their enclosing disclosure. `/docs` and `/docs/[slug]` share the folding reader. Desktop readers have a sidebar; mobile readers have a labeled guide selector. `/examples` and `/examples/[slug]` show exact copy/run instructions and ordinary Java source.

Markdown renders on the server. The browser receives the current route's rendered content and small navigation/folding controllers. Relative file links map to tutorials, guides or the read-only `/source?file=<URL-encoded repository-relative key>` viewer. Unknown, absolute, traversal and repeated source query values return 404. Requests use an exact key lookup in the prepared snapshot and never read a filesystem path. The build-time allowlist contains regular teaching examples, docs, reader documents, project metadata, LICENSE/README and the two canonical framework Java files. Symlinks are skipped.

## ZeroHub

`/hub` discovers checked library components, shows validated GitHub contributor credit, public APIs, preview PNGs, check results and exact Maven pins. `?library=ui1&version=1.0.0` inspects an exact release and never substitutes a newer version. `/hub/prepare` supports sign-in, reservation, editable project download, edited folder upload and automatic check results. Library source stays ordinary Java; coursework links still go separately to Pika.

Set `ZERO_HUB_URL` to the configured service's fixed HTTPS origin or a loopback HTTP origin for local work. The server-only `/api/hub/[...path]` proxy preserves the narrowly scoped session cookies, CSRF and Origin checks. Its path/method, redirect, response-type and byte-limit allowlists remain enforced. Missing or unavailable service configuration shows a useful message. Authentication and publishing belong to the separate hub service; the website holds no service credentials.

`POST /api/hub/project` validates a library bundle and returns a trusted editable project ZIP. It preserves the exact canonical Maven wrapper files, including executable mode, from this repository. Local POM, preview Main, wrapper and editor files are excluded when students upload the edited folder. Its shared runtime packaging contracts are `hub/development-files.mjs`, `hub/contract.mjs` and the canonical `student-template/` wrapper files; include these repository sources in the website build.

Backend `/api/hub` routes and `ZERO_HUB_*` configuration names are internal contracts. The frontend exposes `/hub` and `/hub/prepare`; retired catalog, portable workshop and static Maven gateway routes have been removed.

## Download states

A published kit links directly to verified immutable GitHub assets. While the current kit remains local, optional `release/published-kit.json` provides the last verified public kit, starter and VSIX, with their own version labels. Preparation validates published state, exact URLs, sizes and hashes; fallback cannot be newer than the current kit. A missing fallback shows the availability explanation at `/learn#downloads`. Mac setup publication is independent of the ZIP version.

To preview a new local version, package it from the repository root, then:

```sh
ZERO_LOCAL_DOWNLOADS=1 npm run dev -- --port 3000
```

`/download/kit`, `/download/starter` and `/download/extension` verify authored filenames, receipt versions, sizes and SHA-256 against `dist/` on every request. Local Mac setup additionally checks its signed/notarized provenance and unchanged source. Stale, missing or tampered artifacts fail closed. Binaries stay out of `public/` and Git. Vercel always disables local filesystem downloads. Published assets retain their public links even with the preview flag.

## Hosting and verification

The existing hosting configuration uses Vercel Root Directory `website/`, with source files outside the Root Directory included for build preparation. Install/build commands are `npm ci` and `npm run build`, with Node.js 22.x. Keep `ZERO_LOCAL_DOWNLOADS` unset for hosted builds. GitHub Releases host kit downloads. Deployment, publication, live OAuth and account provisioning require separate authorization.

Tests cover exact-version discovery, contributor links, project wrapper bytes, upload boundaries, proxy authentication/redirect/Origin behavior and download integrity. The optional actual HTTP ZIP test runs against an already-owned loopback server using `ZERO_HUB_TEST_WEBSITE`. A build does not prove interactive browser behavior or native Windows/Linux setup.
