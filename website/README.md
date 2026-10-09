# Zero website

Local Next.js App Router / TypeScript site, using the selected light system-font design. No account, database, live catalog or website Java runtime.

Requires Node.js 22+. From this directory:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev -- --port 3000
```

The package's preparation step reads `../release/kit.json` and the maintained setup/API/product/Workshop docs. It writes ignored `.generated/content.json` and `public/generated/` assets. Re-run preparation/restart after changing canonical docs. Those snapshots let the supporting pages work before source documentation is published. The logo paths are the supplied `extension/media/zero.svg`, with the approved purple colour; the download icon comes from Bootstrap Icons. The editor image is the existing recorded preview, not a claim of final interactive testing.

## Download states

The current published kit links directly to its verified GitHub release assets in development and production, including when the local preview flag is enabled. Unpublished assets lead to their availability explanation at `/learn#downloads` by default.

To preview a **new local version**, first set its release metadata to local and package it from the repository root, then:

```sh
ZERO_LOCAL_DOWNLOADS=1 npm run dev -- --port 3000
```

`/download/kit`, `/download/starter`, `/download/extension` and `/download/components` allow only authored filenames. They verify the current receipt's versions, publication metadata, label, size and SHA-256 against actual `dist/` bytes on every request. Optional components require their own successful package receipt. A stale/missing/tampered package fails closed with a useful 503. No kit binaries enter `public/` or Git. The flag is refused on Vercel; production is normally run without it. Production-build local testing can explicitly enable it with `ZERO_LOCAL_DOWNLOADS=1 npm start`.

A `publication.status: published` requires explicit immutable GitHub URLs matching the authored repository/version/filename, plus verified sizes and SHA-256 values for the kit, starter and extension. Preparation fails if these are absent. Assets inherit the release status unless they set `publicationStatus` to `local` or `published`. The optional components asset can stay `publicationStatus: local` while the main three are published; a local asset must have no public URL. Its download link leads to `/learn#downloads` in production and works only in an explicitly enabled local preview with verified packaged bytes. Publication and URL availability must be independently verified before authoring a published state.

## Vercel hosting

The live site is https://zero.codepet.ca, deployed from `codepetca/zero` on Vercel. The project Root Directory is `website/`; **Include source files outside of the Root Directory in the Build Step** is enabled so preparation can read canonical release/docs and media. Install/build commands are `npm ci` and `npm run build`, with Node.js 22.x selected. Main deploys to production and Git branches receive previews. Keep `ZERO_LOCAL_DOWNLOADS` unset on Vercel. GitHub Release assets host downloads.

Cloudflare supplies the DNS-only CNAME recommended by Vercel; Vercel serves HTTPS. Release and deployment receipts are in the maintained verification record. Do not rebuild or replace published release bytes; prepare a new local kit version first.

Browser interaction and design QA are recorded separately by the coordinator. A build is not proof of browser behavior or native Windows/Linux student setup.
