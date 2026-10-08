# Zero

Zero is a downloadable local Java teaching kit for students beginning Java
through CodeHS. It combines a tiny JavaFX `SimpleApp`, ordinary `Main` and
`Player` classes, and a quiet VS Code profile with a small Run/Stop sidebar.
Students own their GitHub repositories and submit links separately in Pika.

Run App saves, rebuilds and restarts a separate native window. There is no hot
reload. **Upload to GitHub defaults to simulation**; the opt-in live mode reviews
files, commits and uses normal Git HTTPS transport. Real authentication/upload
and student pilots remain unverified. This is a local prototype.

## Start here

- [Student/teacher setup](docs/GETTING-STARTED.md)
- [Starter and small examples](student-template/README.md)
- [Product scope and contracts](docs/PRODUCT.md)
- [Development and contribution checks](docs/DEVELOPMENT.md)
- [Verification and remaining limits](docs/VERIFICATION.md)
- [Actual dark-theme editor](docs/design/actual-zero-editor.png)
- [Selected screen](docs/design/selected-sidebar.png)
- [Student storyboard](docs/design/student-storyboard.png)

Import the settings-only profile first, then install the local Zero VSIX and
the two Java extensions in that profile. Students need VS Code, a supported
JDK 17+ and Git for repository work; they do not need Node.js or global Maven.

## Project layout

- `extension/`: sidebar and commands using supported VS Code APIs.
- `student-template/`: standalone Maven project, readable framework source and
  keyboard, counter and drawing examples outside compiled `src/`.
- `profile/`: quiet light settings profile and separate optional F6/F7 bindings.
- `scripts/`: local checks and packaging.
- `docs/`: setup, decisions and verification evidence.

Contributors use Node.js 22+, JDK 17+, Git and VS Code. Run `npm ci`,
`npm run check`, `npm test` and `python3 scripts/verify-examples.py`.
`npm run package` creates local artifacts in `dist/`: `zero-0.2.0.vsix`,
`zero-starter.zip`, the profile and combined kit ZIP. It does not publish them.

Start contributions with one understandable helper, example or useful error.
Include verification and seek review before a cohort adopts a change. Keep the
library small and preserve explicit object updates.
