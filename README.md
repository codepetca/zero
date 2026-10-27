# Zero

[Get started at zero.codepet.ca](https://zero.codepet.ca).

Zero is a downloadable local Java teaching kit for students beginning Java
through CodeHS. Build interfaces with ordinary JavaFX controls and `App`,
or animate a canvas with `GameApp` and explicitly updated Java objects.
A minimal VS Code sidebar provides Run, Stop and GitHub controls.
Students own their GitHub repositories and submit links separately in Pika.
The local candidate adds [asset import, recovery and guided game sharing](docs/STUDENT-FRICTION.md).

The MVP starts with a small quiz and includes animation, keyboard, counter,
drawing and practice examples. A multi-question [study app](student-template/examples/study/README.md)
builds on the quiz with ordinary Question objects, feedback, score and next/restart.
Readable framework source ships with the starter;
there is no required component or screen base class.

Current source runs apps in native JavaFX windows through the project’s Maven
wrapper, with browser compilation deferred to Publish app or advanced Export for
web. Mac 0.5.43 ships native Run, VS Code Explorer and a New dropdown for New class, New file,
New folder and New asset; earlier downloads retain
their bundled behavior. GitHub actions default to live. Upload and branch changes retain their explicit review steps;
tutorials use student-owned template clones and the same GitHub workflow. The individual flow is New branch →
Commit & push → Merge to main into main, using VS Code's native GitHub session.
First Publish confirms a public destination; later explicit Publish actions update
that approved site without another destination dialog. Published downloads retain
their original behavior and bundled instructions.
Before tutorial lesson 0, students need their own verified GitHub account, Git 2.31+
and school-approved access/privacy setup. See [account and privacy setup](docs/GETTING-STARTED.md#before-lesson-0-github-and-privacy).
A Mac teacher trial verified real sign-in/create/connect/cancel/upload/copy-link.
The current MVP targets Mac with Apple Silicon and Windows; Linux and Intel Macs
are unsupported. Physical Windows and novice student trials remain unverified; see the
[verification record](docs/VERIFICATION.md) for checks actually performed.

## Download Zero

- [Download for Mac with Apple Silicon — Zero 0.5.17](https://github.com/codepetca/zero/releases/download/setup-v0.5.17/Zero-0.5.17-macos.dmg)
- [Download for Windows — unsigned Zero 0.5.54 installer](https://github.com/codepetca/zero/releases/download/windows-preview-v0.5.54/Zero-Setup-0.5.54-windows-development.exe)
- [Windows manual setup ZIP 0.5.54](https://github.com/codepetca/zero/releases/download/windows-manual-v0.5.54/zero-bootstrap.zip); follow `START-HERE.md` for manual setup.

The Windows installer remains an unsigned preview with automatic updates off.
It uses Zero’s private Java21 without changing system Java or ordinary editor
settings. Interactive Windows acceptance is still pending. Original Zero code is
MIT licensed.

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
- [Earlier dark-theme editor, version 0.2](docs/design/actual-zero-editor.png)
- [Selected screen](docs/design/selected-sidebar.png)
- [Student storyboard](docs/design/student-storyboard.png)

Students need VS Code and a supported JDK 17+; Git 2.31+ and browser authentication
are needed for repository work. They do not need Node.js or global Maven.
The published Mac0.5.14 app uses the familiar drag-to-Applications flow. Open Zero
from Applications to prepare its private Java runtime and separate editor automatically.
Later, open Zero again to restore your saved editor session. Windows uses
the complete-kit ZIP with manual setup. See [native setup](docs/INSTALLER.md).
The optional settings-only profile for ZIP/manual setup follows the system light/dark appearance, with 500 ms autosave.
Import it before installing the local Zero VSIX and Java extensions in that
profile. The sidebar also supports dark themes.

## Project layout

- `website/`: Next.js download website, guided tutorials, examples, docs and ZeroHub.
- `extension/`: sidebar and commands using supported VS Code APIs.
- `student-template/`: standalone Maven project, readable framework source and
  alternative examples outside compiled `src/`; `examples/shared/ScoreDisplay.java`
  is the canonical component reused by quiz, practice and study apps.
- `sharing/`: GitHub publication records, immutable artifact delivery and catalog.
- `hub/checker/`: disconnected reference for the unresolved hosted-checker gate.
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
`npm run package` creates local artifacts in `dist/`: `zero-0.5.14.vsix`,
`zero-starter.zip`, the profile and `zero-bootstrap.zip`. Extract the complete
kit once to find `START-HERE.md`, `starter/`, the VSIX and optional profile.
Browse games and exact library versions at `/hub`. Students share from their existing public game repository, with reusable classes under `libraries/<slug>/`. The new native tools and GitHub registry are local development code; hosted library checking remains closed. See [the adoption plan](docs/GITHUB-SHARING-PLAN.md) and [Development](docs/DEVELOPMENT.md). Local packaging does not publish.

Maintainers approve a reviewed new version with `npm run release:publish -- --version 0.5.4`.
The command checks, publishes verified files, updates the website through a checked PR
and verifies the live kit. See [releasing Zero](docs/RELEASING.md) for prerequisites,
recovery and the read-only `--verify-only` option.

Start contributions with one understandable helper, example or useful error.
Try a shared change in two apps and seek review before a cohort adopts it.
Original Zero code is available under the [MIT license](LICENSE). Bundled
upstream dependencies and wrapper notices retain their own terms. Migrated sample libraries retain their MIT notices.
