# Current state — 2026-10-08

## Completed local MVP goal and execution plan

Owner explicitly requested setting a goal and orchestrating the agreed work.
Build the small framework first, then real examples and exercises; finish local
GitHub onboarding and package a locally verified kit for a classroom pilot.
The current task coordinates this work on `codex/zero-app-framework`, based on
merged main `fdacdd46eb560fd8ef36e29027a0b116cb35b32e`.

The owner subsequently requested “pr and merge it” on 2026-10-08, authorizing
push and PR/merge of this completed MVP into codepetca/zero main. This does not
authorize deployment, Marketplace/release publication, credential modification
or real GitHub upload trials. All authentication/transport checks use mocks.
Physical classroom testing remains a documented pilot gate, not an automated claim.

One execution plan:

1. Framework: event-driven SimpleApp plus explicit canvas SketchApp; ordinary
   JavaFX controls, classes and useful errors. Exit: lifecycle, input, controls
   and all examples pass local finite GUI checks.
2. Learning examples: quiz, animation and tracker reuse ScoreDisplay; caption
   extension demonstrates contributions. Exit: exact-copy reuse and meaningful
   behavior checks pass, exercises and contribution instructions ship in ZIP.
3. GitHub onboarding: native session, website repo creation, connect, reviewed
   opt-in upload and copy URL. Exit: cancellation/auth removal/account drift and
   credential isolation covered without real sign-in or network transport.
4. Integrate, independently review, verify and regenerate ZIP/VSIX. Exit: local
   checks green, bounded review findings resolved, artifact contents verified,
   limitations and student pilot checklist recorded.

Ownership and receipts (coordinator updates this record):

- framework_mvp: delivered/inspected; student-template/** and scripts/verify-examples.py;
  GPT-6.1 Sol/high, fresh context, started ~12:51 UTC. Owns API/examples/checks.
- github_mvp: delivered/inspected; extension/**; GPT-6.1 Sol/high, fresh context, started
  ~12:51 UTC. Owns native-session bridge, sidebar states and intercepted tests.
- coordinator: root docs, packaging/check scripts, integration and goal status.
- mvp_guides: delivered/inspected; root README and four product/setup/development/
  pilot guides; GPT-6.1 Sol/medium, ~six minutes, no rework required. Ownership
  released. Coordinator corrected starter's old separate-Git-credentials text.
- Worker evidence: 30 Node tests, Maven compile/smoke and six finite GUI examples
  passed. Coordinator's disposable quiz/caption/movement exercises passed (9.55s).
  All writer ownership released; implementation and independent review complete.
  Final package regeneration and extracted-starter checks completed below.
- Initial weekly remaining 68%; attributable worker/coordinator tokens unknown.
  DeepSeek pilot paused through 2026-12-31, so no DeepSeek launches.

Review plan: high risk because foundational lifecycle and credential transport
change. After inexpensive checks, one initial wave of two independent GPT-6.1
Sol/high reviewers: framework/compatibility and auth/security. Default budget:
at most seven launches, one full-diff wave, four targeted remediation waves/fix
batches, one final integration wave, 60 minutes total/30 minutes per reviewer.
Initial review ledger: two launches, one full-diff wave, one
combined remediation batch. Initial head `353c3cb4082aa8b406f479de4dcc50f5bfd70993`.
Framework reviewer: complete, no new blocker; two nonblocking corrections accepted
(frame cleanup and historical guidance). Auth reviewer: complete, two accepted P1s
(persistent Trace2 logging and removed session before dispatch). All four fixed.
Affected smoke passed (2.506s); mutant smoke proves old cleanup is detected.
Auth/transport 10 tests and full Node 32 tests pass; targeted independent review
next. Native 0.3.0 VSIX installation passed, but computer-use selected the older
editor process; new-version physical sidebar/shortcut checks remain a pilot gap.

Targeted wave 1 completed at `c47b4ca036699c4bde9764266a679ebfd8a2f47a`:
original P1s resolved; new interacting P1 (async final lookup reopened Git URL
rewrite interval). Second fix batch replaces the last async lookup with a
required synchronous ticket check after all async preparation. Old/unknown Git
versions fail closed (2.31+ required). Affected auth/transport/UI 16 tests and
full Node 36 tests pass; guides now specify the minimum Git version. Ledger:
three reviewer turns, one initial wave, one targeted wave, two fix batches;
second targeted wave next, then one final integration pass for the shared contract.

Targeted wave 2 completed at `55724e228440a9419e453f10c02ff5c0d87999db`:
sync session guard accepted; residual destination interval during mkdtemp found.
Coordinator reproduced failure locally before changing production, moved mkdtemp
before the final root/rewrite checks and cleanup scope around those checks.
Full Node 37 tests passed (14.12s), configuration check and diff check passed.
Ledger now four reviewer turns, two targeted waves, three fix batches; one final
targeted check plus one cumulative integration check remain. Same boundary has
recurred once after its first fix; a further recurrence invokes the human checkpoint.

Targeted wave 3 and final cumulative integration review completed clean at
`d0127761507500abddc4e4ea680d66eef7770f62`, against base
`fdacdd46eb560fd8ef36e29027a0b116cb35b32e`. No remaining actionable blocker
was found. Final integration confirmed shared session/transport/upload contracts,
simulation isolation, unchanged Run/Stop contracts, framework cleanup and guides.
Final ledger: six reviewer turns, one initial wave, three targeted waves,
three fix batches and one final integration wave, within the default budget.
Review took approximately 25 minutes; the final pass took about three minutes.
Worker token telemetry is unavailable. The credential boundary needed three
remediation batches; the coordinator reproduced and fixed the last small ordering
issue. All deliveries were inspected and verified before acceptance.

Local MVP implementation is complete. Final ZIP/VSIX regenerated; all starter,
extension and combined-kit bytes verified. Extracted starter in a path with spaces
passed finite GUI smoke (2.553s Maven time); final VSIX installed through isolated
VS Code CLI. Final check and diff validation passed. Artifacts remain ignored in
dist/. At local completion, no push/publication, credential changes or real
uploads had occurred. The subsequent PR/merge request is authorized above.
Real authentication/upload, physical 0.3 editor interaction, Windows/Linux and
student trials remain the separate classroom-pilot gate.

## Current publication gate

Reuse independent review of implementation head d012776 and the completed local
checks. Coordinator inspected the later evidence/authorization-only documentation
delta; no implementation changed. origin/main remains fdacdd4, so no base sync or
new interaction boundary exists. No additional reviewer wave is needed. GitHub
checks, threads, readiness and final head will be checked on the PR before merge.
Publication outcome will be recorded in the PR and final user report.

## Previously delivered kit (historical evidence)

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

## Previous publication authority

The owner explicitly requested PR and merge, then directed creation of public
codepetca/zero. This supersedes the initial no-publication hold for the kit source.
Target main through feature branch codex/zero-local-kit. No deployment, Marketplace
publication, release upload or account credential changes are authorized.

Initial high-reasoning upload/IDE reviews accepted five fixes in one batch;
targeted follow-up accepted the corrected delta. Publication reuses that coverage
and runs a bounded focused integration pass; the PR records its final decision.
All workers have released file ownership. The earlier Processing template is
preserved. Generated dist, caches and verification logs stay out of Git.
