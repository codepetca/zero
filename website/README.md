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

Default development and production expose the honest unpublished state at `/learn#downloads`. There is no guessed release URL. For an explicitly enabled **local** preview, first package the kit from the repository root, then:

```sh
ZERO_LOCAL_DOWNLOADS=1 npm run dev -- --port 3000
```

`/download/kit`, `/download/starter`, `/download/extension` and `/download/components` allow only authored filenames. They verify the current receipt's versions, publication metadata, label, size and SHA-256 against actual `dist/` bytes on every request. Optional components require their own successful package receipt. A stale/missing/tampered package fails closed with a useful 503. No kit binaries enter `public/` or Git. The flag is refused on Vercel; production is normally run without it. Production-build local testing can explicitly enable it with `ZERO_LOCAL_DOWNLOADS=1 npm start`.

A future `publication.status: published` must provide explicit immutable GitHub URLs matching the authored repository/version/filename, plus verified sizes and SHA-256 values for every advertised asset. Preparation fails if these are absent. Publication and URL availability must be independently verified before authoring that state.

## Later Vercel setup

No deployment configuration or account changes are performed here. The proposed project Root Directory is `website/`. Enable **Include source files outside of the Root Directory in the Build Step** so preparation can read canonical `release/`, docs, `student-template/`, `component-workshop/` and `extension/media/`. Use `npm ci` and `npm run build`. Do not set `ZERO_LOCAL_DOWNLOADS` there. This phase does not publish releases or configure Vercel/DNS.

Browser interaction and design QA are recorded separately by the coordinator. A build is not proof of browser behavior or native Windows/Linux student setup.
