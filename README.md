# Zero

[Get started at zero.codepet.ca](https://zero.codepet.ca).

Zero is a downloadable local Java teaching kit for students beginning Java
through CodeHS. Build interfaces with ordinary JavaFX controls and `SimpleApp`,
or animate a canvas with `SketchApp` and explicitly updated Java objects.
A minimal VS Code sidebar runs the app in a separate native window.
Students own their GitHub repositories and submit links separately in Pika.

The MVP starts with a small quiz and includes animation, keyboard, counter,
drawing and practice examples. A multi-question [study app](student-template/examples/study/README.md)
builds on the quiz with ordinary Question objects, feedback, score and next/restart.
Readable framework source ships with the starter;
there is no required component or screen base class.

Run App saves, rebuilds and restarts. **Upload, Start and Finish default to simulation**.
The individual flow is Start a change → Upload changes → Finish change into main.
The opt-in live path reviews changes and uses VS Code's native GitHub session.
A Mac teacher trial verified real sign-in/create/connect/cancel/upload/copy-link.
Physical Windows/Linux and novice student trials remain unverified; see the
[verification record](docs/VERIFICATION.md) for checks actually performed.

## Download Zero

[Download Zero 0.5.1](https://github.com/codepetca/zero/releases/download/v0.5.1/zero-bootstrap.zip) and follow `START-HERE.md`.
The complete kit is a single ZIP; original Zero code is MIT licensed.

## Start here

- [Student/teacher setup](docs/GETTING-STARTED.md)
- [Starter and example copy instructions](student-template/README.md)
- [Student API](student-template/API.md)
- [Component lifecycle and Workshop](docs/COMPONENTS.md)
- [Zero Community: component source and contributions](https://github.com/codepetca/zero-community)
- [Product scope and contracts](docs/PRODUCT.md)
- [Development and contributions](docs/DEVELOPMENT.md)
- [Release preparation and publication](docs/RELEASING.md)
- [Classroom pilot checklist](docs/CLASSROOM-PILOT.md)
- [Verification and remaining limits](docs/VERIFICATION.md)
- [Earlier dark-theme editor, version 0.2](docs/design/actual-zero-editor.png)
- [Selected screen](docs/design/selected-sidebar.png)
- [Student storyboard](docs/design/student-storyboard.png)

Students need VS Code and a supported JDK 17+; Git 2.31+ and browser authentication
are needed for repository work. They do not need Node.js or global Maven.
The optional settings-only profile defaults to light, with 500 ms autosave.
Import it before installing the local Zero VSIX and Java extensions in that
profile. The sidebar also supports dark themes.

## Project layout

- `website/`: Next.js download website, guided tutorials, examples, docs and Community.
- `extension/`: sidebar and commands using supported VS Code APIs.
- `student-template/`: standalone Maven project, readable framework source and
  alternative examples outside compiled `src/`; `examples/shared/ScoreDisplay.java`
  is the canonical component reused by quiz, practice and study apps.
- `component-workshop/`: native preview, examples/API, explicit candidate build/checks
  and local contribution export for the separate community library.
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
`npm run package` creates local artifacts in `dist/`: `zero-0.5.1.vsix`,
`zero-starter.zip`, the profile and `zero-bootstrap.zip`. Extract the complete
kit once to find `START-HERE.md`, `starter/`, the VSIX and optional profile. After the documented local
component proof, `npm run package:components` adds `zero-components.zip` with
Workshop, community source, both immutable versions and a local catalog.
These are experimental local artifacts; packaging does not publish them.

Start contributions with one understandable helper, example or useful error.
Try a shared change in two apps and seek review before a cohort adopts it.
Original Zero code is available under the [MIT license](LICENSE). Bundled
upstream dependencies and wrapper notices retain their own terms. Zero Community
original source is also MIT licensed; its experimental archive is not part of this release.
