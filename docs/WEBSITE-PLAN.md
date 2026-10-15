# Zero website and ZeroHub

Keep the selected ultra-minimal design: Zero wordmark, one short description, a primary Get started button and a quieter returning-student tutorial link. No editor screenshot or numbered onboarding on the landing page. See [saved theme](design/WEBSITE.md) and [selected mockup](design/selected-landing.png).

`website/` is a pinned Next.js app in the Zero repo, deployed independently to Vercel. Cloudflare manages `zero.codepet.ca` DNS; no GitHub Pages.

| Address | Purpose |
| --- | --- |
| `/` | Minimal landing with Get started and returning-student tutorial link |
| `/get-started` | Public GitHub preparation → install → owned template/clone → lesson0 → Upload/optional Publish guide |
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
