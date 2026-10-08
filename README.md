# Zero

Zero is a downloadable local Java teaching kit for students beginning Java
through CodeHS. Build interfaces with ordinary JavaFX controls and `SimpleApp`,
or animate a canvas with `SketchApp` and explicitly updated Java objects.
A minimal VS Code sidebar runs the app in a separate native window.
Students own their GitHub repositories and submit links separately in Pika.

The MVP starts with a small quiz and includes animation, keyboard, counter,
drawing and practice examples. Readable framework source ships with the starter;
there is no required component or screen base class.

Run App saves, rebuilds and restarts. **Upload to GitHub defaults to simulation**.
The opt-in live path reviews changes and uses VS Code's native GitHub session.
Real sign-in/upload, physical Windows/Linux execution and student pilots remain
unverified. This is a locally developed MVP for a classroom pilot; see the
[verification record](docs/VERIFICATION.md) for checks actually performed.

## Start here

- [Student/teacher setup](docs/GETTING-STARTED.md)
- [Starter and example copy instructions](student-template/README.md)
- [Product scope and contracts](docs/PRODUCT.md)
- [Development and contributions](docs/DEVELOPMENT.md)
- [Classroom pilot checklist](docs/CLASSROOM-PILOT.md)
- [Verification and remaining limits](docs/VERIFICATION.md)
- [Actual dark-theme editor](docs/design/actual-zero-editor.png)
- [Selected screen](docs/design/selected-sidebar.png)
- [Student storyboard](docs/design/student-storyboard.png)

Students need VS Code and a supported JDK 17+; Git 2.31+ and browser authentication
are needed for repository work. They do not need Node.js or global Maven.
The optional settings-only profile defaults to light, with 500 ms autosave.
Import it before installing the local Zero VSIX and Java extensions in that
profile. The sidebar also supports dark themes.

## Project layout

- `extension/`: sidebar and commands using supported VS Code APIs.
- `student-template/`: standalone Maven project, readable framework source and
  alternative examples outside compiled `src/`; `examples/shared/ScoreDisplay.java`
  is the canonical component reused by quiz and practice.
- `profile/`: optional light settings profile and separate F6/F7 bindings.
- `scripts/`: local checks and packaging.
- `docs/`: setup, decisions, pilot checklist and verification evidence.

Contributors use Node.js 22+, JDK 17+, Git and VS Code. Run `npm ci`,
`npm run check`, `npm test` and `python3 scripts/verify-examples.py`.
`npm run package` creates local artifacts in `dist/`: `zero-0.3.0.vsix`,
`zero-starter.zip`, the profile and combined kit ZIP. It does not publish them.

Start contributions with one understandable helper, example or useful error.
Try a shared change in two apps and seek review before a cohort adopts it.
A public license for original Zero code has not yet been selected; bundled
upstream dependency notices retain their own terms.
