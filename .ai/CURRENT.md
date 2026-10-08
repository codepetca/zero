# Current state — 2026-10-07

Zero is a downloadable local Java teaching kit: a minimal VS Code extension and
optional settings profile, plus a small readable JavaFX SimpleApp library.
Preserve ordinary Java, explicit object updates and separate native app windows.
Students own their GitHub repositories and submit their links separately in Pika.

## Verified local delivery

Extension 0.2.0, Maven/JavaFX starter, ordinary Main/Player and three alternatives:
keyboard movement, native-control counter and drawing. Settings-only profile
imports on Mac; install the local VSIX and two Java extensions in that profile.
The profile defaults to light; the sidebar follows dark themes too.

Run saves, cleans, compiles and restarts. Native Mac checks cover sidebar Run/Stop,
standard build shortcut, repeated shortcut restart, compiler Problems navigation,
autosave and actual screenshot. Node suite: 21 passing tests. Three real finite
GUI example checks and extracted-ZIP smoke pass. Windows/Linux physical execution,
real GitHub authentication/transport and student classroom pilots remain unverified.
See docs/VERIFICATION.md for evidence, reviews and next platform checks.

Upload defaults to labelled simulation. Opt-in live mode reviews repository,
branch/files and commit message before confirmation; commits and pushes captured
SHA/destination and confirms the remote branch. Tests intercept all transport.
Connect is local-only, serialized with Upload, and guards the exact student root.
No custom credential storage, automatic Pika submission or hot reload.

## Publication authority and current phase

The owner explicitly requested PR and merge, then directed creation of public
codepetca/zero. This supersedes the initial no-publication hold for the kit source.
Target main through feature branch codex/zero-local-kit. No deployment, Marketplace
publication, release upload or account credential changes are authorized.

Initial high-reasoning upload/IDE reviews accepted five fixes in one batch;
targeted follow-up accepted the corrected delta. Publication reuses that coverage
and runs a bounded focused integration pass; the PR records its final decision.
All workers have released file ownership. The earlier Processing template is
preserved. Generated dist, caches and verification logs stay out of Git.
