# Zero repository boundaries

Zero is one product with separately built parts. The download website belongs
to the product repository; it is not part of the student's Java application.
The public source repositories are [Zero](https://github.com/codepetca/zero) and
[Zero Community](https://github.com/codepetca/zero-community), owned by Codepet.

## Where work belongs

| Folder | Owns | Does not ship in the main student starter |
| --- | --- | --- |
| `website/` | Next.js front page, Learn more, Community entry point | Website source/runtime |
| `extension/` | Supported VS Code sidebar, Run/Stop and individual Git workflow | Extension contributor tests/tooling |
| `framework/` | Canonical SimpleApp/SketchApp source and core library build | Maintainer verification harness |
| `student-template/` | Student app, assets, examples, exercises and Maven configuration | Build outputs and maintainer-only checks |
| `component-workshop/` | Local component previews/checks and contribution preparation | Workshop belongs in the separate optional kit |
| `profile/` | Optional editor settings and keybindings | No mandatory profile import |
| `release/` | Authored compatible kit/core versions and asset names | No binaries or fabricated release receipts |
| `scripts/` | Source assembly, integration verification and local packaging | Node/Python maintainer tools |
| `docs/` | Maintained guides, product contracts, design and verification | Internal plans do not become app source |

## One canonical source

Edit framework classes in `framework/src/main/java/zero/`. Maintainer preparation
assembles ignored readable source copies into the starter. Downloads contain
these files and are ordinary standalone Maven Java projects; students can edit
their own copies without running Zero's maintainer tooling. Changing a downloaded
copy does not silently change the upstream API.

Keep contributor-only Java harnesses separate from shipped app source. Keep
examples outside the default compiled app until the student deliberately chooses
one. Existing ScoreDisplay extraction lessons remain readable examples;
promoting a helper into core is a deliberate API decision, not a folder move.

The website prepares content from maintained repository documentation and release
metadata rather than maintaining a second API reference or setup guide. Generated
content, source copies, caches and distribution files stay out of Git.

## Source ownership versus component distribution

Zero Community owns component source, examples, tests, metadata and admission
checks. Keep its checkout beside Zero for local Workshop development. Do not add
it as a submodule or silently clone arbitrary branches into student apps.

An app consumes an exact Maven library version. Its own Java code owns rules and
state and explicitly updates ordinary objects. Zero's extension can help select
a dependency, but Maven resolves it. A GitHub source remote is not a configured
public Maven repository. Current catalog/artifacts remain local prototypes.

Community adoption and promotion into core require source-bound checks and
independent appointed maintainers. AI remains advisory. Pika coursework submission
uses each student's own repository link and is a separate workflow.

## Releases and website deployment

`release/kit.json` records compatible versions, expected assets and publication
status. Packaging creates actual sizes/checksums in ignored `dist/release.json`.
The website distinguishes available local preview bytes from an unpublished
public release. Preserve immutable coordinates when build metadata changes;
a website wording change does not require a new Java kit.

Each part has proportionate checks. Verify the assembled ZIP independently from
the source workspace, including executable wrapper permissions and readable core
source. A website build or HTTP response does not establish native Java behavior.

Later, Vercel builds `website/` separately and Cloudflare manages `zero.codepet.ca`
DNS. Include repository sources outside the Vercel Root Directory for build-time
documentation/release preparation. No website account system, student Node
runtime, artifact-publishing backend or live AI service is required by this local
MVP. See [the website plan](WEBSITE-PLAN.md) for rollout authority.
