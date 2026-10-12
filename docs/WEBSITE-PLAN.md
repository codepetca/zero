# Zero website and ZeroHub

Keep the selected ultra-minimal design: Zero wordmark, one short description, Download Zero and Learn more. No editor screenshot or numbered onboarding on the landing page. See [saved theme](design/WEBSITE.md) and [selected mockup](design/selected-landing.png).

`website/` is a pinned Next.js app in the Zero repo, deployed independently to Vercel. Cloudflare manages `zero.codepet.ca` DNS; no GitHub Pages.

| Address | Purpose |
| --- | --- |
| `/` | Minimal download landing page |
| `/learn`, `/tutorials/[lesson]` | Visual quick paths, expandable details and thirteen maintained lessons |
| `/examples`, `/source` | Runnable examples, explicit copy instructions and readable source |
| `/docs` | Setup, student API and teacher/developer guidance |
| `/hub` | ZeroHub component/library discovery, contributor credit, previews, API and exact versions |
| `/hub/prepare` | Sign in, prepare/download a library, upload source and inspect automatic checks |
| `/api/hub` | Same-origin service proxy, immutable Maven artifacts and project download |

Build-time preparation reads maintained sources from this repository. Include files outside Vercel's website Root Directory for preparation. Generated content and binaries stay out of Git. No sibling Community repo, catalog, Workshop download or compatibility routes remain.

Kit downloads use reviewed immutable GitHub release assets, with local preview bytes clearly distinguished. Native Mac setup and ZIP/manual flows remain separate; students need no Node or global Maven. GitHub repository submission to Pika is separate from ZeroHub library sharing.

ZeroHub is implemented locally. Vercel does not execute candidate Java: GitHub OAuth, managed PostgreSQL, durable storage and isolated checker workers are separate hosted infrastructure. Production activation needs applicable owner authorization and the outstanding independent checker review. Local demo identity cannot become production authentication.

Verify frontend tests/types/build, actual browser navigation/download/upload, and native Maven consumers through the production proxy. Website builds do not establish physical Windows/Linux behavior. [Verification](VERIFICATION.md) records actual evidence.
