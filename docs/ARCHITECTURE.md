# Zero repository boundaries

[codepetca/zero](https://github.com/codepetca/zero) owns the whole product. ZeroHub is the shared-library feature at `zero.codepet.ca/hub`, not another source repository. Its services can deploy independently.

| Folder | Responsibility |
| --- | --- |
| `framework/` | Canonical ordinary Java SimpleApp/SketchApp library |
| `extension/` | Minimal supported VS Code sidebar, Run/Stop, GitHub and ZeroHub actions |
| `student-template/` | Standalone student app, tutorials and deliberately selected examples |
| `libraries/` | Maintained sample libraries, their source, API, examples and checks |
| `website/` | Minimal Next.js download page, learning material and ZeroHub interface |
| `hub/` | ZeroHub service, PostgreSQL schema, isolated checker and separate publisher |
| `profile/` | Optional editor settings and keybindings |
| `release/`, `scripts/` | Compatible release definitions, assembly and verification |
| `docs/` | Product contracts, development guidance and evidence |

## Source and distribution

Canonical framework classes live in `framework/src/main/java/zero/`. Preparation assembles readable copies into the standalone starter. Students can edit their own copies without maintainer tools. Examples stay outside compiled source until selected deliberately.

Maintained sample libraries live in this repo. Moving a useful sample here does not promote its API into core. The Starter UI bundle groups StartScreen, Hud and ScoreDisplay; health-bar alternatives demonstrate another related-class bundle.

Student apps and library source belong in students' own GitHub repositories. Uploaded libraries do not become folders in Zero. ZeroHub stores contributor identities, reservations, submissions, reports, immutable release metadata and artifact bytes in its database/storage. GitHub hosts source; Maven resolves exact downloadable library versions.

Components expose ordinary Java methods and a JavaFX `Node view()`. Apps own rules and state, use independent component instances and explicitly update objects. No automatic registry, new language or app-within-app engine.

## Runtime boundaries

The website proxies the service through `/api/hub`. Candidate Java runs in bounded isolated workers without service credentials; a separate publisher validates the checked bytes without executing candidate code. One source repo does not imply one process or shared runtime permissions.

The website deploys to Vercel, with Cloudflare DNS for `zero.codepet.ca`. Database, durable storage and checking workers are separate infrastructure. Student machines need no Node, Docker or ZeroHub server.

## Releases and checks

`release/kit.json` defines compatible kit/core versions and three kit assets. Packaging measures actual sizes/checksums in ignored `dist/release.json`. Verify extracted ZIP permissions, source parity and a real Maven build independently of website checks.

ZeroHub has a local verified implementation; public activation requires authentication and hosted infrastructure plus the outstanding independent checker review. Native macOS ARM64 and Linux ARM64 checker evidence do not establish physical Windows/Linux or novice usability. See [development](DEVELOPMENT.md), [components](COMPONENTS.md) and [verification](VERIFICATION.md).
