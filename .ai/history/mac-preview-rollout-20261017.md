# Current state — Mac preview rollout, 2026-10-17

Coordinator: Lead publishing task, 01a13f98-55fc-7471-9038-1198b14d5a98.
The owner explicitly approved the coordinated Mac 0.5.18 preview rollout and live
verification. Preserve ordinary Java, strict WebFX, browser-first Run App, student
GitHub ownership and the minimal sidebar. Physical Windows remains deferred;
its public manual ZIP stays 0.5.17. Generic library execution remains closed under
its separate checker rejection: do not retry or bypass it.

## Delivered

PR #80 merged as 8aec173119bf9d24f44307933ca876ac615d8788. Final c1b5123
head passed all five CI checks. Signed/notarized/stapled Mac candidate built from
3836224 and prepared at 1e9ac6d passed launcher preparation/opening/warm resume,
installed extension parity, Study and Sky Hop Chrome Run/Stop, all 13 checksums,
independent Ed25519 archive/feed signatures and build ordering 17 to 18.

Native setup-v0.5.18 is now a public preview release containing exactly one DMG:
4,514,655 bytes, SHA256 db08da032b99e8d0e9ed36ff06af2b75f250a81761b1f11995986c4f88e114fa.
Its anonymous public download exactly matches the sealed tested candidate.
The standalone three-file v0.5.18 kit remains local; published-kit.json stays 0.5.17.

All five reviewed complete template PRs are merged. Actual public main merge SHAs
and reviewed trees are recorded in website/content/project-templates.json. An
independent anonymous check matched all 109 archive files, Git paths/modes/blobs,
repository IDs/template settings, Main.java and executable mvnw. Existing exact
WebFX/Chrome evidence remains valid. Tutorial scaffolds were already current.

Both game-only admission gates are now enabled under explicit rollout approval,
using reviewed publisher policy 1b63ae6ce07f467ab4c4600d78507157ad3bdc7c.
Reconciliation run 39034386434 succeeded. The preflight found registry sequence 22
unchanged, only the three already-accepted fixture issues open, and all seven
retained immutable object hashes unchanged. Never select old bea against enriched
registry state. Rollback disables both admission gates while retaining compatible
publisher/history/objects; use append-only withdrawal when needed.

Sky Hop remains at https://armorup.github.io/zero-sharing-proof/, source b69879a,
Pages run 38983460841, 68 exact tested public files. ZeroHub accepted game 0.1.1
has a verified Play receipt and immutable 32-file source snapshot. Legacy catalog
projection omits web; enriched catalog retains it. Prior isolated backup/restore
passed; current rollout must verify these public contracts again.

## Finish this phase

The publication metadata change uses the actual anonymously verified Mac URL,
unchanged sealed signed appcast/build 18 and actual merged template SHAs. Complete
its proportional independent review/CI/merge, then verify actual live Home/Downloads,
served updater signatures/archive, template links, game availability notice and
ZeroHub Play in Chrome. Record exact final merge/deployment and receipts in the
existing plan. No new owner approval is required for this approved rollout.

Root owns source/Git/operator/UI. Worktree:
/Users/stew/.codex/worktrees/release-readiness/zero. Preserve original funding
checkout, other Applications apps, student projects and accepted storage/history.
Do not overwrite or reseal dist/candidates/mac-0.5.18-1e9ac6d93ca6.

Physical audio listening, native clipboard paste, fresh-machine/new-account OAuth,
novice/school-network and physical Windows trials remain unverified. Audio CI
timeout was not reproduced; retain diagnostics, do not claim an audio fix.

Detailed evidence/operation/review ledger: .verification/mac-release-20261016/plan.json,
MAC-PREVIEW-PUBLICATION-PLAN.md and docs/EVIDENCE.md. DeepSeek remains paused.
