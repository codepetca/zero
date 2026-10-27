# Zero website and ZeroHub

Keep the selected ultra-minimal design: Zero wordmark, one short description, Mac Silicon and Windows ZIP download buttons. No editor screenshot or numbered onboarding on the landing page. See [saved theme](design/WEBSITE.md) and [selected mockup](design/selected-landing.png).

`website/` is a pinned Next.js app in the Zero repo, deployed independently to Vercel. Cloudflare manages `zero.codepet.ca` DNS; no GitHub Pages.

| Address | Purpose |
| --- | --- |
| `/` | Minimal landing with Mac Silicon and Windows ZIP downloads |
| `/get-started` | Legacy setup address; redirects to `/downloads` |
| `/learn`, `/tutorials/[lesson]` | Visual quick paths, expandable details and thirteen maintained lessons |
| `/examples`, `/source` | Runnable examples, explicit copy instructions and readable source |
| `/docs` | Setup, student API and teacher/developer guidance |
| `/hub` | ZeroHub component/library discovery, contributor credit, previews, API and exact versions |
| `/hub/share` | Instructions for native Share game/library and GitHub requests |
| `/api/sharing/catalog` | Bounded read-only fixed Git registry and immutable Blob catalog |

Build-time preparation reads maintained sources from this repository. Include files outside Vercel's website Root Directory for preparation. Generated content and binaries stay out of Git. No sibling Community repo, catalog, Workshop download or compatibility routes remain.

Kit downloads use reviewed immutable GitHub release assets, with local preview bytes clearly distinguished. Native Mac setup and ZIP/manual flows remain separate; students need no Node or global Maven. GitHub repository submission to Pika is separate from ZeroHub library sharing.

The replacement sharing platform uses GitHub requests and a durable Git ledger,
with immutable public Blob artifact files. It has no database or website OAuth.
The website does not execute candidate Java. Generic hosted library execution
remains closed pending its outstanding independent acceptance; game snapshots
are structurally checked and packaged without executing their source.

Verify frontend tests/types/build, browser navigation, exact releases and failure
states, and real Maven consumption. Website builds do not establish physical
Windows or novice usability. [Verification](VERIFICATION.md) records actual
receipts; [the adoption plan](GITHUB-SHARING-PLAN.md) owns rollout criteria.


## Function bundle reduction — 2026-10-27

Release/download/update metadata is generated separately from learner docs/source.
Only download controls/handlers and update feeds use the small release snapshot;
all existing document/source reader entries and validations are preserved. Five
filesystem-reading route traces exclude tests, build metadata, duplicate static
assets and raw website UI/build files. Runtime dependencies and canonical jam
assets remain traced; public assets remain in static hosting.

A fresh current-main comparison at 779af4d4 measured about 12.66 MB to 7.4 MB in
the deduplicated local route inventory (~41% less). The download trace fell from
7.30 MB to about 2.06 MB; template traces from 3.79 MB to about 2.09 MB. Local Mac
trace sizes are not Vercel Linux bundle sizes or billed GB-months. At publication
start the existing hosted production FtNWgLgRL resource table reported 3.18 MB for
the download and both template functions; the project Usage view showed 209.53 MB
deployment, 515.12 MB function and 14.55 MB Blob storage, with reporting delay.

All eight metadata fields and prepared feed bytes matched the fixed baseline;
all learner document/source entries matched before adding these audit receipts.
Website build/typecheck and all243website tests pass. Both audit commands now run
after the website build in CI. `audit:bundles` rejects copied build/UI/test/public
files and missing templates. `check:runtime` runs compiled handlers in a traced-only
temporary package, verifies feeds and download bounds, and checks production Jam
denial even after changing the process environment. The source template generator
separately verifies both Game/App types using staged canonical files; this does not
open the compiled production gate. Normal template tests also cover generation.

The owner authorized PR, merge and production deployment, with ZeroJams hidden.
Publish through the real CI gates, preserve the Mac0.5.52 release/feed and immutable
GitHub assets, and compare the new hosted function sizes against FtNWgLgRL. Overall
storage can temporarily rise while old and new deployments coexist; do not label
that aggregate change as bundle savings. Deployment/CI receipts belong to the
publication PR and ignored .verification/function-bundles/.
