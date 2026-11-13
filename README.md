# Zero

## Learn to Build

**Starting from zero**

Build Java apps and games, practice GitHub workflows, learn to read documentation, and publish your work to the web.
Follow the [tutorials](https://zero.codepet.ca/tutorials/15) from a first Java
project to a playable app. Read the [docs](https://zero.codepet.ca/docs) when
you need a method or example. Save changes in your own GitHub repository and
publish a playable link with GitHub Pages.

Zero runs locally in VS Code. Build interfaces with `App` or animate a canvas
with `GameApp` and explicitly updated Java objects. Apps run in native JavaFX
windows; publishing compiles them for the browser. Readable framework source
ships with the starter; there is no required component or screen base class.
Students submit links separately in Pika.

Before starting a tutorial project, students need their own verified GitHub account
and school-approved access/privacy setup. See [account and privacy setup](docs/GETTING-STARTED.md#before-lesson-0-github-and-privacy).
Zero targets Mac with Apple Silicon and Windows; Linux and Intel Macs are
unsupported. See the [verification record](docs/VERIFICATION.md) for checks
actually performed.

## Download Zero

<!-- npm run release:publish rewrites the manual-kit link below; keep exactly one. -->
- [Download Zero for Mac with Apple Silicon](https://zero.codepet.ca)
- [Get Zero Studio from Microsoft Store](https://apps.microsoft.com/detail/9mxkd6dqlfgx)
- [Manual setup — complete kit ZIP 0.5.73](https://github.com/codepetca/zero/releases/download/v0.5.73/zero-bootstrap.zip)

Microsoft Store provides Zero for Windows.
Each published download retains the license shipped with it.
Current Zero source is free for individual personal use. Schools and other
organizations need an approved, paid license for use covered by the current
license; [contact Codepet](mailto:info@codepet.ca) for pricing.

## Start here

- [Student/teacher setup](docs/GETTING-STARTED.md)
- [Starter and example copy instructions](student-template/README.md)
- [Student API](student-template/API.md)
- [ZeroHub components and libraries](docs/COMPONENTS.md)
- [Public ZeroHub catalog](https://zero.codepet.ca/hub)
- [ZeroHub local run guide](hub/README.md)
- [Product scope and contracts](docs/PRODUCT.md)
- [ZeroJams architecture and phased delivery](docs/ZEROJAMS-PLAN.md)
- [Development and contributions](docs/DEVELOPMENT.md)
- [Release preparation and publication](docs/RELEASING.md)
- [Classroom pilot checklist](docs/CLASSROOM-PILOT.md)
- [Verification and remaining limits](docs/VERIFICATION.md)

Students need VS Code and a supported JDK 17+; Git 2.31+ and browser authentication
are needed for repository work. They do not need Node.js or global Maven.
See [native setup](docs/INSTALLER.md) for installing on each platform.

## Project layout

- `website/`: Next.js download website, guided tutorials, examples, docs and ZeroHub.
- `extension/`: sidebar and commands using supported VS Code APIs.
- `student-template/`: standalone Maven project, readable framework source and
  alternative examples outside compiled `src/`.
- `sharing/`: GitHub publication records, immutable artifact delivery and catalog.
- `hub/checker/`: reference code for hosted library checking.
- `libraries/`: maintained component bundles, API, examples and checks.
- `framework/`: canonical Java source and core JAR build; readable source copies
  are assembled into the standalone student starter.
- `profile/`: optional light settings profile and separate F6/F7 bindings.
- `scripts/`: local checks and packaging.
- `release/`: compatible kit/core versions, asset names and publication status.
- `docs/`: setup, decisions, pilot checklist and verification evidence.

See [repository boundaries](docs/ARCHITECTURE.md) for ownership, source assembly
and the distinction between source hosting and component artifact distribution.

Contributors use Node.js 22+, JDK 17+, Git and VS Code. Run `npm ci`,
`npm run check`, `npm test` and `python3 scripts/verify-examples.py`.
`npm run package` creates local artifacts in `dist/`, including the extension
VSIX, the starter and the complete kit. Local packaging does not publish.
Browse games and exact library versions at `/hub`. Students share from their existing public game repository, with reusable classes under `libraries/<slug>/`. See [the adoption plan](docs/GITHUB-SHARING-PLAN.md) and [Development](docs/DEVELOPMENT.md).

Maintainers approve a reviewed new version with `npm run release:publish -- --version <version>`.
The command checks, publishes verified files, updates the website through a checked PR
and verifies the live kit. See [releasing Zero](docs/RELEASING.md) for prerequisites,
recovery and the read-only `--verify-only` option.

Start contributions with one understandable helper, example or useful error.
Try a shared change in two apps and seek review before a cohort adopts it.
Current source is offered under the [Zero Source-Available License](LICENSE).
Individual personal use and noncommercial starter app editing and sharing are
permitted. Organizational use requires an approved, paid license; contact
info@codepet.ca for pricing. For material offered solely under that license,
changes to Zero itself and commercial use require prior express written consent.
Prior MIT rights remain intact. Bundled
upstream dependencies and wrapper notices retain their own terms. Migrated sample libraries retain their MIT notices.
