# Zero shared GitHub identity — 2026-10-18

Owner chose one Codepet-owned GitHub App for desktop Zero and ZeroHub. Canonical
plan: docs/ZERO-IDENTITY-PLAN.md. Keep GitHub identity, selected plus App-created
repositories, offline local Run, ordinary Java and separate Pika submission.
Browser/editor use separate credential families; browser tokens can inherit
selected repository authority. No pairing or broad native OAuth fallback.

Worktree: /Users/stew/.codex/worktrees/zerohub-simplify/zero.
Branch codex/zerohub-project-feedback, draft PR102. Core migration1548a0e and
public registration pin a11d982 passed independent reviews. Live desktop testing
found that current VS Code uses authority-free vscode-userdata storage. Fix8ed733a
accepts that absolute local path and preserves cross-scheme filesystem locking;
remote authorities/relative paths remain rejected. Targeted Sol/high review clean.
Six reviewer launches, two fix batches; all source reviews completed within the
original review budget. Details in ignored .verification/zero-identity/plan.json.

Registered Codepet Zero under codepetca (owner116690057): App5367740,
clientIv23liWzC8OE2WN5f6qV, slugcodepet-zero. Exact public metadata and seven
permissions verified. Owner approved registration, draft push, one private test
repo and installation limited to it, then explicitly confirmed user authorization.
Chrome reports device connected; real Zero provider shows Signed in as armorup.
Guarded private clone opened the expected main branch, restored the connection
in the new host, and Commit & push uploaded only the acceptance-test text file.
GitHub confirmed the expected commit and clean local tree. Exact private IDs and
screenshots stay in ignored receipts. Tests used an isolated official Code copy
and temporary profile, preserving user editor state. No private key/client secret
was generated. No production credentials, merge, deployment or native release.

At8ed733a:26focused credential/provider tests; full extension598tests,
597pass/1existing skip/0fail; root check passes. Website148tests/typecheck/build
from a11d982 reused because website source is unchanged. All five CI checks passed
at a11d982; latest fix CI is running. PR remains draft.

Remaining acceptance: fresh empty account/first repo, actual App repo creation,
refresh/revocation, account drift, Pages and browser stars; physical Windows/Safari.
Selected installation requires at least one repository. Publish recovery guide
before activation. Production/native release and merge remain separate gates.
Preserve dirty main, ignored evidence, installer0.5.19 and publisher policy11c5451.
DeepSeek paused through2026-12-31; weekly51% remaining was account-wide. Latest
fresh storage305.7GB healthy; no cleanup.
