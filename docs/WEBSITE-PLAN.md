# Zero download website

Status: live at https://zero.codepet.ca, 2026-10-09. Owner authorized release and
hosting with “go” and selected MIT. Current receipts are in `.ai/CURRENT.md` and
`VERIFICATION.md`. The implementation and release plan below records the agreed
boundaries; initial local-only restrictions were lifted for this release.

Selected visual: the first ultra-minimal revision, confirmed 2026-10-09.
See [the saved design/theme](design/WEBSITE.md) and
[canonical mockup](design/selected-landing.png).

## Goal

A student visits `zero.codepet.ca`, gets the correct kit, follows a short setup
guide and runs a first local Java app. Keep the Java teaching kit and minimal
VS Code workflow central. The website does not run Java apps in the browser.

## Student experience

- Keep the landing page ultra minimal: Zero name/mark, one short description,
  **Download Zero** and **Learn more**. No editor/app screenshots, numbered
  setup steps, feature sections, workshop promotion or documentation navigation.
- **Learn more** opens a separate page containing the product explanation,
  setup guide, screenshots, API docs, GitHub source and Component Workshop links.
- On that page, explain the kit contains the Zero extension, ready-to-open starter, optional
  profile and setup guide. VS Code and the JDK are separate prerequisites.
- Walk through prerequisites, extracting the ZIP, installing the extension,
  opening the starter and Run App. Explain first-run internet downloads.
- Keep Git installation, commit identity and native VS Code GitHub authentication
  in the later save/upload section. Students submit their repository URL in Pika.
- Offer starter-only, extension-only and previous releases under a small
  “Other downloads” disclosure. Put Component Workshop below the main onboarding.
- Explain that cloning/downloading the Zero source repo is for developing Zero.
  A future starter-only GitHub template can provide “Use this template”; do not
  point students at a template containing the entire Zero development workspace.

## Architecture

Use Next.js App Router and TypeScript in a self-contained `website/` directory
in `codepetca/zero`, with pinned dependencies and its own lockfile. Configure one
Vercel project with Root Directory `website/`. Pages are mostly static:

- `/`: Zero name/mark, short description, Download Zero and Learn more only.
- `/learn`: product explanation, screenshots and links to setup, API docs,
  GitHub source, other downloads and the Component Workshop.
- `/community`: public entry point for Zero Community, source/contribution links
  and an honest explanation of current experimental local component tooling.
- Setup lives on `/learn`; do not create a separate onboarding platform.
- Ten supporting `/docs/[slug]` pages render maintained repository Markdown,
  with matching heading anchors and internal links. Preparation keeps one source.

No website account system or database is needed for this MVP. Node.js is a site
development/build requirement, not an additional student requirement.

## Downloads and maintenance

Recommend immutable, versioned GitHub Release assets for ZIP/VSIX downloads.
Vercel hosts the website; GitHub hosts downloadable release files. This uses no
GitHub Pages hosting. Avoid storing kit binaries in Git or adding a storage API.

Flatten the current bootstrap package: extract once to find `starter/`, the VSIX,
optional profile and setup guide. Preserve the separate starter and workshop kits.

Use one release manifest for version, filenames, checksums and URLs. Generate
website release data and README download information from it. Pin all recommended
assets to the same release. Publication must succeed and downloads must be checked
before the site advertises that release. The main 0.5.0 kit, starter and VSIX are published with verified immutable URLs.
The optional community archive remains local and has no public asset URL.

After hosting/release automation is explicitly authorized, prepare versioned
artifacts through CI, verify them, then publish through an intentional release
action. Configure Vercel Git previews and main production deployment. Keep release
maintenance to one approved version change rather than repeated manual link edits.

## Hosting and domain steps

1. Build and review the site locally, including mobile layouts and real downloads.
2. With deployment authorization, inspect the existing Vercel team/projects and
   Cloudflare `codepet.ca` zone and any `zero` record before making changes.
3. Connect `codepetca/zero` to one Vercel Next.js project, root `website/`. Review
   a Vercel preview before assigning the production domain.
4. Add `zero.codepet.ca` in the project's domain settings. Copy the exact unique
   CNAME target Vercel supplies into Cloudflare, record name `zero`.
5. Recommend DNS-only (grey cloud) for this record. Vercel handles website delivery
   and its certificate; Cloudflare remains the authoritative DNS provider.
6. Add a verification TXT record only if Vercel requires it. Keep the existing
   zone/nameservers and other records. Verify DNS, Vercel domain status, HTTPS,
   redirects and downloads on the final domain.

Account access and exact DNS values are determined at deployment time. This plan
does not assume an existing Vercel project, an unused record or a fixed CNAME value.

## Acceptance and delivery order

1. Front-page concept selected; preserve the recorded design and theme.
2. Implement the local website and flatten the kit packaging.
3. Verify production build, keyboard navigation, contrast, responsive layout,
   documentation accuracy, download URLs and extracted archive contents.
4. Prepare a concrete release and hosting configuration for review. Resolve the
   existing public license decision before publishing original Zero code/assets.
5. Publish/deploy and configure the domain only with explicit authorization.

Report actual platform evidence: responsive web checks do not establish that
Windows/Linux native Java setup or the interactive GitHub upload flow was tested.

## Current shared contracts

- `release/kit.json` is authored release metadata. Packaging generates checksums
  and sizes in ignored `dist/release.json`; never invent a published asset URL.
- Kit0.5.0 main assets are published; optional community archive remains local.
  Core0.1.1 is a new local coordinate for changed build
  metadata after source extraction; preserve previous immutable core0.1.0 files.
- Canonical Java source moves into `framework/src/main/java/zero/`. Maintainer
  preparation assembles readable copies into the starter; student downloads
  remain standalone and need no Node.js tooling.
- Website reads canonical release/docs through build preparation; its own npm
  package stays independent of root tooling. Vercel must include repository
  sources outside the `website/` Root Directory for this build preparation.
- Local preview downloads require an explicit local-only environment flag and
  verified packaged bytes. Ordinary production builds show release availability
  on Learn more until publication. Published main assets use verified GitHub links.

## Primary technical references

- [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying)
- [Vercel repository root configuration](https://vercel.com/docs/monorepos)
- [Vercel custom domains and unique subdomain CNAMEs](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Cloudflare DNS proxy status](https://developers.cloudflare.com/dns/proxy-status/)
- [GitHub release download links](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)

## Hosting preparation — 2026-10-09

Owner authorized release/hosting with “go”. Vercel Zero project created and
configured for Next.js, website/ root, Node22.x, npmci/npmbuild and inclusion of
canonical sources outside root. Domain zero.codepet.ca assigned; ownership
verified. Cloudflare has no existing zero record; DNS remains unchanged until
a working deployment is verified. MIT selected for original Zero on2026-10-09; no source
push, artifact release or deployment happened in the initial preparation step. Main
kit/starter/VSIX can publish independently of the local-only community archive.

## Live delivery — 2026-10-09

Source and verified download metadata merged through PR4 and PR5. Zero0.5.0
published under MIT; all three main downloads were retrieved unauthenticated and
hashed. Vercel Git connection uses main production, rootwebsite and canonical
sources outside root. Remote build/page checks passed before Cloudflare DNS-only
CNAME was created. Domain ownership/configuration, public HTTPS, HTTP redirect,
live browser kit download and Learn→Community navigation verified. Windows/Linux
native setup and final editor Git interaction remain untested. Release automation
is a future improvement; current release was intentional and manually verified.
