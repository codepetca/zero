# Current state — Zero 0.5.9 published, download integration pending

Updated 2026-10-13. Worktree:
`/Users/stew/.codex/worktrees/github-sharing-adoption/zero`;
branch `codex/mac-0-5-9-candidate`. Read PRODUCT and DEVELOPMENT before changes.

Owner authorized the Mac walkthrough and kit/native release. The owner confirmed
manual unlock. Actual isolated Zero 0.5.9 editor created Greeting, Study and Game
in separate windows with empty boilerplate and local-only/Git-disabled markers.
Native Run started all three; Greeting Run again terminated the previous process
and rebuilt its edits. Study and Game ran maintainer checkpoint 10 test inputs,
reusing byte-identical ScoreDisplay. Greeting and Study were stopped through the
sidebar. JavaFX windows are not exposed by the connector; a human visual question
is pending. No visual interaction claim. JDK reused from verified private runtime;
this was not a fresh-machine Java download trial. Normal user projects preserved.

Source [PR40](https://github.com/codepetca/zero/pull/40) merged at
`b206eb376b39d2a8298f1b184dd9bda0bca47061`; reviewed head `f7c7335` passed exact
CI38484256871. Signed/notarized immutable candidate sealed at
`dist/candidates/mac-0.5.9-3c0ed2e24ae4/`; build source f7c7335, preparation source
3c0ed2e. Developer ID, payload/modes, both architecture signatures, Apple Accepted
receipt, staple and Gatekeeper passed. Existing signer and notary profile reused;
no account or credential changes. Old 0.5.8 bytes remain immutable.

Published releases: [Mac setup](https://github.com/codepetca/zero/releases/tag/setup-v0.5.9)
targets exact preparation3c0ed2e with one DMG; [kit](https://github.com/codepetca/zero/releases/tag/v0.5.9)
targets exact reviewed buildf7c7335 with three assets. Draft downloads and anonymous
public downloads matched every sealed hash and size. Main still serves 0.5.8 until
reviewed metadata integration. Local kit/native manifests now promote only those
verified URLs and bytes; fallback published-kit remains verified0.5.8.

[Draft PR41](https://github.com/codepetca/zero/pull/41) will integrate release
metadata, README links and verification records. Its initial CI failed a playground
test that assumed every installer was published. Test-only correction c08d9cd has
separate published/local fixture coverage; focused checks pass. Independent Luna/
medium review31 found no issues. Corrected CI38487453531 is running; latest promotion
requires independent delta review and exact-head CI before normal merge/deployment.
Source reviews26–29 and measured native review30 are complete; two prior source fix
batches plus one test-only batch. Cumulative reviewer turns31. Effective models,
per-review tokens/time unknown; usage85% remaining account-wide at initial reading,
storage327.7GB healthy/no cleanup. DeepSeek paused. Task stop waiver persists.

Next: verify promoted metadata/tests/build, review delta, push PR41, finish normal
exact-head CI/merge, then verify Vercel and anonymous live Mac/ZIP downloads. Stop
remaining owned Game process after collecting any human visual reply. Do not rebuild
sealed or published assets. Logs/receipts/screenshots: `.verification/release-0.5.9/`.
Physical Windows and student trials are deferred. Generic public executor acceptance
remains held after provider rejections; general game publication disabled; Neon
retained. Full GitHub adoption remains incomplete. No new goal/task/automation.
